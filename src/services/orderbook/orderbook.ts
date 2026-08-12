import { create } from "@bufbuild/protobuf";
import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { publicationHandlerErrorContext } from "../../shared/subscription-errors.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import {
    snapshotThenStream,
    type SnapshotThenStreamSubscription,
} from "../../realtime/snapshot-then-stream.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import {
    createReadyGate,
    decimalInputToScaled,
    type SdkScales,
} from "../../shared/decimal-surface.js";
import {
    formatOrderbookLevel,
    GetOrderbookInputSchema,
    createOrderbookDataSchema,
    type OrderbookLevel,
    type OrderbookData,
} from "./orderbook.schemas.js";
import { toBig } from "../../utils/u128.js";
import { isResourceNotFoundError } from "../../utils/errors.js";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";

interface SubscribeOrderbookInput extends BaseSubscribeInput<OrderbookData> {
    symbol: string;
    symbolId: number;
    depth?: number;
    bucket?: string | null;
}

export interface OrderbookStreamHandlers extends BaseSubscribeInput<OrderbookData> {}

export interface OrderbookSubscription {
    unsubscribe: () => void;
    setBucket: (bucket: string | null | undefined) => void;
}

export interface CreateOrderbookSubscriptionInput
    extends
        OrderbookStreamHandlers,
        Pick<SubscribeOrderbookInput, "symbol" | "symbolId" | "depth" | "bucket"> {}

type BookSide = Map<bigint, bigint>;

/**
 * Reads spot order book snapshots and maintains realtime local order book state from public delta channels.
 */
export class OrderbookService {
    #client: Client<typeof Proto.OrderbookService>;
    #realtime: PolyesterRealtime;
    #scales: SdkScales;

    constructor(transport: Transport, realtime: PolyesterRealtime, scales: SdkScales) {
        this.#client = createClient(Proto.OrderbookService, transport);
        this.#realtime = realtime;
        this.#scales = scales;
    }

    /**
     * Fetches a spot order book depth snapshot for a symbol and requested depth, returning best bids and asks with the backend book sequence.
     */
    async get(
        input: v.InferInput<typeof GetOrderbookInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<OrderbookData> {
        const validated = parse(GetOrderbookInputSchema, input);
        await this.#scales.ready();
        const res = await this.#client.getOrderBook(
            { symbol: validated.symbol, depth: validated.protoDepth },
            toConnectCallOptions(options),
        );
        return parse(createOrderbookDataSchema(this.#scales, validated.symbol), {
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
        const symbolId = parse(v.pipe(v.number(), v.integer(), v.gtValue(0)), input.symbolId);
        const wsDepth = Math.min(500, Math.max(1, Math.trunc(input.depth ?? 50)));
        const channel = `public:spot:orderbook:deltas:depth:${wsDepth}:${symbolId}:proto`;

        const client = this.#client;
        const scales = this.#scales;
        const gate = createReadyGate(
            () => scales.ready(),
            (error) => input.onError?.(publicationHandlerErrorContext(channel, error)),
        );

        let bidsMap: BookSide = new Map();
        let asksMap: BookSide = new Map();
        let currentBookSeq = 0n;
        let bucketTicks: bigint | null = null;
        let stream: SnapshotThenStreamSubscription | undefined;

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
            return entries
                .slice(0, limit)
                .map(([priceTicks, qtyScaled]) =>
                    formatOrderbookLevel({ priceTicks, qtyScaled }, scales, symbolId),
                );
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
            gate.run(() => {
                input.onEvent({
                    symbol: input.symbol,
                    depth: wsDepth,
                    bookSeq: currentBookSeq.toString(),
                    bids: sideToUIBucketed(bidsMap, "bids", wsDepth, bucketTicks),
                    asks: sideToUIBucketed(asksMap, "asks", wsDepth, bucketTicks),
                });
            });
        }

        function setBucket(bucket: string | null | undefined): void {
            if (!bucket) {
                bucketTicks = null;
            } else {
                try {
                    bucketTicks = decimalInputToScaled("bucket", bucket, scales.price());
                } catch {
                    bucketTicks = null;
                }
            }
            if (stream?.isReady()) emit();
        }

        async function inputServiceFetch(): Promise<Proto.GetOrderBookResponse> {
            const validated = parse(GetOrderbookInputSchema, {
                symbol: input.symbol,
                depth: wsDepth,
            });
            try {
                return await client.getOrderBook({
                    symbol: validated.symbol,
                    depth: validated.protoDepth,
                });
            } catch (error: unknown) {
                if (!isResourceNotFoundError(error)) throw error;

                return create(Proto.GetOrderBookResponseSchema, {
                    bookSeq: 0n,
                    bids: [],
                    asks: [],
                });
            }
        }

        function handleDelta(delta: Proto.OrderBookDelta): void {
            if (delta.reset) {
                bidsMap.clear();
                asksMap.clear();
                currentBookSeq = 0n;
            }

            if (currentBookSeq !== 0n && delta.bookSeqStart > currentBookSeq + 1n) {
                stream?.refreshSnapshot();
                return;
            }

            if (delta.bookSeqEnd <= currentBookSeq) return;

            applySideDelta(bidsMap, delta.bids);
            applySideDelta(asksMap, delta.asks);

            currentBookSeq = delta.bookSeqEnd > currentBookSeq ? delta.bookSeqEnd : currentBookSeq;
            emit();
        }

        setBucket(input.bucket);
        stream = snapshotThenStream({
            realtime: this.#realtime,
            channel,
            schema: Proto.OrderBookDeltaSchema,
            maxBufferedPublications: 200,
            snapshotErrorLog: "Failed to fetch orderbook",
            fetchSnapshot: inputServiceFetch,
            readPublication: (delta) => [delta],
            applySnapshot: (snapshot, bufferedDeltas) => {
                bidsMap = levelsToMap(snapshot.bids);
                asksMap = levelsToMap(snapshot.asks);
                currentBookSeq = toBig(snapshot.bookSeq);
                emit();
                for (const delta of bufferedDeltas) {
                    if (stream?.isDisposed()) return;
                    handleDelta(delta);
                }
            },
            applyLivePublications: (deltas) => {
                for (const delta of deltas) {
                    if (stream?.isDisposed()) return;
                    handleDelta(delta);
                }
            },
            onOpen: input.onOpen,
            onClose: input.onClose,
            onError: input.onError,
        });

        function dispose(): void {
            stream?.unsubscribe();
        }

        return { unsubscribe: dispose, setBucket };
    }
}
