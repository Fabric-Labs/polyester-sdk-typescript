import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    OrderbookDataSchema,
    GetOrderbookInputSchema,
    type OrderbookLevel,
    type OrderbookData,
} from "./orderbook.schemas.js";
import { formatConnectError } from "../../utils/errors.js";
import { parsePriceTicks } from "../../utils/numbers.js";
import { formatQtyForSymbol, int6ToDecimalString } from "../../catalogs/orders-catalog.js";
import { toBig } from "../../utils/u128.js";
import { getPair } from "../../catalogs/market-data-catalog.js";
import * as v from "valibot";
import { isDev } from "../../utils/is-dev.js";

interface SubscribeOrderbookInput extends BaseSubscribeInput<OrderbookData> {
    symbol: string;
    depth?: number;
    bucket?: string | null;
}

export interface OrderbookStreamHandlers extends BaseSubscribeInput<OrderbookData> {}

export interface OrderbookSubscription {
    unsubscribe: () => void;
    setBucket: (bucket: string | null | undefined) => void;
}

export interface CreateOrderbookSubscriptionInput
    extends OrderbookStreamHandlers, Pick<SubscribeOrderbookInput, "symbol" | "depth" | "bucket"> {}

type BookSide = Map<bigint, bigint>;

export class OrderbookService {
    #client: Client<typeof Proto.OrderbookService>;
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(Proto.OrderbookService, transport);
        this.#realtime = realtime;
    }

    async get(input: v.InferInput<typeof GetOrderbookInputSchema>): Promise<OrderbookData> {
        const validated = v.parse(GetOrderbookInputSchema, input);
        const res = await this.#client.getOrderBook(validated);
        return v.parse(OrderbookDataSchema, {
            symbol: validated.symbol,
            depth: validated.depth,
            bookSeq: res.bookSeq,
            bids: res.bids,
            asks: res.asks,
        });
    }

    subscribe(input: SubscribeOrderbookInput): () => void {
        return this.createSubscription(input).unsubscribe;
    }

    createSubscription(input: CreateOrderbookSubscriptionInput): OrderbookSubscription {
        const pair = getPair(input.symbol);
        if (!pair) {
            if (isDev()) {
                console.error(`[OrderbookService] Unknown symbol: ${input.symbol}`);
            }
            return { unsubscribe: () => {}, setBucket: () => {} };
        }

        // Devnet delta channels currently publish reliably up to depth 500.
        // Clamp subscription depth to keep live updates flowing.
        const wsDepth = Math.min(500, Math.max(1, Math.trunc(input.depth ?? 50)));
        const channel = `public:spot:orderbook:deltas:depth:${wsDepth}:${pair.symbolId}:proto`;
        const symbolId = pair.symbolId;

        const client = this.#client;

        let bidsMap: BookSide = new Map();
        let asksMap: BookSide = new Map();
        let currentBookSeq = 0n;
        let snapshotReady = false;
        let isDisposed = false;
        let pendingDeltas: Proto.OrderBookDelta[] = [];
        let bucketTicks: bigint | null = null;

        function levelsToMap(levels: Proto.PriceLevel[] | undefined): BookSide {
            const map: BookSide = new Map();
            for (const l of levels ?? []) {
                if (l.qtyScaled === 0n) continue;
                map.set(l.priceTicks, l.qtyScaled);
            }
            return map;
        }

        function applySideDelta(map: BookSide, levels: Proto.PriceLevel[] | undefined): void {
            for (const l of levels ?? []) {
                if (l.qtyScaled === 0n) map.delete(l.priceTicks);
                else map.set(l.priceTicks, l.qtyScaled);
            }
        }

        function sideToUI(map: BookSide, side: "bids" | "asks", limit: number): OrderbookLevel[] {
            const entries = Array.from(map.entries());
            entries.sort(([pa], [pb]) => {
                if (pa === pb) return 0;
                return side === "bids" ? (pa > pb ? -1 : 1) : pa < pb ? -1 : 1;
            });
            return entries.slice(0, limit).map(([priceTicks, qtyScaled]) => ({
                priceTicks: priceTicks.toString(),
                qtyScaled: qtyScaled.toString(),
                priceDisplay: int6ToDecimalString(priceTicks),
                qtyDisplay: formatQtyForSymbol(qtyScaled, symbolId),
            }));
        }

        function sideToUIBucketed(
            map: BookSide,
            side: "bids" | "asks",
            limit: number,
            bucket: bigint | null,
        ): OrderbookLevel[] {
            if (!bucket || bucket <= 0n) return sideToUI(map, side, limit);

            const agg: BookSide = new Map();
            for (const [priceTicks, qtyScaled] of map.entries()) {
                if (qtyScaled <= 0n) continue;
                const bucketPrice = (priceTicks / bucket) * bucket;
                agg.set(bucketPrice, (agg.get(bucketPrice) ?? 0n) + qtyScaled);
            }
            return sideToUI(agg, side, limit);
        }

        function emit(): void {
            input.onEvent({
                symbol: input.symbol,
                depth: wsDepth,
                bookSeq: currentBookSeq.toString(),
                bids: sideToUIBucketed(bidsMap, "bids", wsDepth, bucketTicks),
                asks: sideToUIBucketed(asksMap, "asks", wsDepth, bucketTicks),
            });
        }

        function setBucket(bucket: string | null | undefined): void {
            if (!bucket) {
                bucketTicks = null;
            } else {
                try {
                    bucketTicks = parsePriceTicks(bucket, "bucket");
                } catch {
                    bucketTicks = null;
                }
            }
            if (snapshotReady) emit();
        }

        async function refetchSnapshot(): Promise<void> {
            const snapshot = await inputServiceFetch();
            bidsMap = levelsToMap(snapshot?.bids ?? []);
            asksMap = levelsToMap(snapshot?.asks ?? []);
            currentBookSeq = toBig(snapshot?.bookSeq ?? 0n);
            snapshotReady = true;
            emit();
        }

        async function ensureSnapshot(): Promise<void> {
            snapshotReady = false;
            pendingDeltas = [];
            try {
                await refetchSnapshot();
                const buffered = pendingDeltas;
                pendingDeltas = [];
                for (const delta of buffered) {
                    if (isDisposed) return;
                    handleDelta(delta);
                }
            } catch (e: unknown) {
                // @ts-expect-error - TODO: fix this
                input.onError?.({ message: formatConnectError(e, "snapshot failed") });
            }
        }

        async function inputServiceFetch(): Promise<Proto.GetOrderBookResponse | undefined> {
            const validated = v.parse(GetOrderbookInputSchema, {
                symbol: input.symbol,
                depth: wsDepth,
            });
            try {
                const res = await client.getOrderBook(validated);
                return res;
            } catch (err) {
                if (isDev()) {
                    console.error("Failed to fetch orderbook", err);
                }
            }
        }

        function handleDelta(delta: Proto.OrderBookDelta): void {
            if (delta.reset) {
                bidsMap.clear();
                asksMap.clear();
                currentBookSeq = 0n;
            }

            if (currentBookSeq !== 0n && delta.bookSeqStart > currentBookSeq + 1n) {
                void ensureSnapshot();
                return;
            }

            if (delta.bookSeqEnd <= currentBookSeq) return;

            applySideDelta(bidsMap, delta.bids);
            applySideDelta(asksMap, delta.asks);

            currentBookSeq = delta.bookSeqEnd > currentBookSeq ? delta.bookSeqEnd : currentBookSeq;
            emit();
        }

        setBucket(input.bucket);
        void ensureSnapshot();

        const unsubscribe = this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.OrderBookDeltaSchema,
            onPublication: (delta) => {
                if (!snapshotReady) {
                    pendingDeltas.push(delta);
                    if (pendingDeltas.length > 200) pendingDeltas = pendingDeltas.slice(-200);
                    return;
                }
                handleDelta(delta);
            },
            onConnected: () => {
                input.onOpen?.();
                if (!snapshotReady || pendingDeltas.length === 0) return;
                const buffered = pendingDeltas;
                pendingDeltas = [];
                for (const d of buffered) {
                    if (isDisposed) return;
                    handleDelta(d);
                }
            },
            onDisconnected: () => {
                if (isDisposed) return;
                input.onClose?.();
                void ensureSnapshot();
            },
            onError: (ctx) => input.onError?.(ctx),
        });

        function dispose(): void {
            isDisposed = true;
            pendingDeltas = [];
            try {
                unsubscribe();
            } catch {
                // noop
            }
        }

        return { unsubscribe: dispose, setBucket };
    }
}
