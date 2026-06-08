import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import {
    createOrderbookSchemas,
    GetOrderbookInputSchema,
    type OrderbookLevel,
    type OrderbookData,
} from "./orderbook.schemas.js";
import { formatConnectError } from "../../utils/errors.js";
import { parsePriceTicks } from "../../utils/numbers.js";
import { int6ToDecimalString } from "../../catalogs/orders-catalog.js";
import { toBig } from "../../utils/u128.js";
import * as v from "valibot";
import { isDev } from "../../utils/is-dev.js";
import { staticCatalog, type CatalogReader } from "../../catalogs/index.js";

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

/**
 * Reads spot order book snapshots and maintains realtime local order book state from public delta channels.
 */
export class OrderbookService {
    #client: Client<typeof Proto.OrderbookService>;
    #realtime: RealtimeClient;
    #catalog: CatalogReader;
    #schemas: ReturnType<typeof createOrderbookSchemas>;

    constructor(
        transport: Transport,
        realtime: RealtimeClient,
        catalog: CatalogReader = staticCatalog,
    ) {
        this.#client = createClient(Proto.OrderbookService, transport);
        this.#realtime = realtime;
        this.#catalog = catalog;
        this.#schemas = createOrderbookSchemas(catalog);
    }

    /**
     * Fetches a spot order book depth snapshot for a symbol and requested depth, returning best bids and asks with the backend book sequence.
     */
    async get(
        input: v.InferInput<typeof GetOrderbookInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<OrderbookData> {
        const validated = v.parse(GetOrderbookInputSchema, input);
        const res = await this.#client.getOrderBook(validated, toConnectCallOptions(options));
        const schemas = this.#schemas.current();
        return v.parse(schemas.orderbookData, {
            symbol: validated.symbol,
            depth: validated.depth,
            bookSeq: res.bookSeq,
            bids: res.bids,
            asks: res.asks,
        });
    }

    /**
     * Subscribes to the managed order book stream for a symbol and forwards reconstructed snapshots to onEvent. This is a convenience wrapper around createSubscription().unsubscribe.
     */
    subscribe(input: SubscribeOrderbookInput): () => void {
        return this.createSubscription(input).unsubscribe;
    }

    /**
     * Creates a stateful order book subscription that first fetches a snapshot, buffers proto deltas from public:spot:orderbook:deltas:depth:{depth}:{symbolId}:proto, applies sequence-checked updates, and refetches on gaps or reconnects. The returned handle can unsubscribe or change local price bucket aggregation without reconnecting.
     */
    createSubscription(input: CreateOrderbookSubscriptionInput): OrderbookSubscription {
        const pair = this.#catalog.market.requirePairBySymbol(input.symbol);

        const wsDepth = Math.min(500, Math.max(1, Math.trunc(input.depth ?? 50)));
        const channel = `public:spot:orderbook:deltas:depth:${wsDepth}:${pair.symbolId}:proto`;
        const symbolId = pair.symbolId;
        const catalog = this.#catalog;

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
                qtyDisplay: catalog.orders.formatQuantity(qtyScaled, symbolId),
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
            bidsMap = levelsToMap(snapshot.bids);
            asksMap = levelsToMap(snapshot.asks);
            currentBookSeq = toBig(snapshot.bookSeq);
            snapshotReady = true;
            emit();
        }

        function reportSnapshotError(error: unknown): void {
            if (isDev()) {
                console.error("Failed to fetch orderbook", error);
            }
            input.onError?.({
                channel,
                type: "snapshot",
                error: {
                    code: 0,
                    message: formatConnectError(error, "snapshot failed"),
                },
            });
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
                reportSnapshotError(e);
            }
        }

        async function inputServiceFetch(): Promise<Proto.GetOrderBookResponse> {
            const validated = v.parse(GetOrderbookInputSchema, {
                symbol: input.symbol,
                depth: wsDepth,
            });
            return client.getOrderBook(validated);
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
