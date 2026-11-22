import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { createClient, type Client } from "@connectrpc/connect";
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
    createCatalogRefreshQueue,
    decimalInputToScaled,
    hasKnownSymbol,
    withCatalogRefresh,
    type SdkScales,
} from "../../shared/decimal-surface.js";
import { tsObjToMs } from "../../utils/time.js";
import {
    formatOrderbookLevel,
    GetOrderbookInputSchema,
    createOrderbookDataSchema,
    type OrderbookLevel,
    type OrderbookData,
} from "./orderbook.schemas.js";
import { orderbookWsChannelDepth } from "./orderbook.codecs.js";
import { DepthTierCodec } from "../../shared/depth-tier.js";
import { PolyesterError, ServiceUnavailableError, ValidationError } from "../../shared/errors.js";
import type * as v from "valibot";
import { parse } from "../../shared/validation.js";
import type { PublicApiTransports } from "../../shared/transports.js";

interface SubscribeOrderbookInput extends BaseSubscribeInput<OrderbookData> {
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
        Pick<SubscribeOrderbookInput, "symbolId" | "depth" | "bucket"> {}

type BookSide = Map<bigint, bigint>;

/**
 * Reads spot order book snapshots and maintains realtime local order book state from public delta channels.
 */
export class OrderbookService {
    #client: Client<typeof Proto.OrderbookService>;
    #realtime: PolyesterRealtime;
    #scales: SdkScales;

    constructor(transports: PublicApiTransports, realtime: PolyesterRealtime, scales: SdkScales) {
        this.#client = createClient(Proto.OrderbookService, transports.publicApi);
        this.#realtime = realtime;
        this.#scales = scales;
    }

    /**
     * Fetches a spot order book depth snapshot for a symbol ID and depth tier (`DEPTH_TIER_VALUES`, default 50), returning best bids and asks with the backend book sequence.
     * When `available` is false the book is being built or was invalidated: its levels are unknown, not empty, so read it again later instead of treating empty sides as no liquidity.
     */
    async get(
        input: v.InferInput<typeof GetOrderbookInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<OrderbookData> {
        const validated = parse(GetOrderbookInputSchema, input);
        await this.#scales.ready();
        const res = await this.#client.getOrderBook(
            { symbolId: validated.symbolId, depth: DepthTierCodec.inputToProto[validated.depth] },
            toConnectCallOptions(options),
        );
        // Servers that predate the served tier leave it unset; they served the requested one.
        const served = DepthTierCodec.protoToOutput[res.depth];
        return withCatalogRefresh(this.#scales, () =>
            parse(createOrderbookDataSchema(this.#scales, validated.symbolId), {
                symbolId: res.symbolId,
                depth: typeof served === "number" ? served : validated.depth,
                bookSeq: res.bookSeq,
                bookEpoch: res.bookEpoch,
                available: isBookAvailable(res),
                bids: res.bids,
                asks: res.asks,
                ts: res.ts,
            }),
        );
    }

    /**
     * Subscribes to the managed order book stream for a symbol ID and forwards reconstructed snapshots to onEvent. This is a convenience wrapper around createSubscription().unsubscribe.
     */
    subscribe(input: SubscribeOrderbookInput): () => void {
        return this.createSubscription(input).unsubscribe;
    }

    /**
     * Creates a stateful order book subscription that first fetches a snapshot, buffers proto deltas from public:spot:orderbook:deltas:depth:{depth}:{symbolId}:proto, applies each delta only when it chains onto the book, and refetches on reconnects. After a sequence gap the book holds its last state until the server's next reset, sent about every 30 seconds and after gaps. A snapshot whose book is not available fails with ServiceUnavailableError through onError and is retried. A snapshot error that is not retried (such as a 500) leaves the book to the server's next reset, which rebuilds it. The snapshot is fetched once the channel opens, so a socket that cannot connect reports a retryable RealtimeError with type "transport" through onError instead, once per outage; onOpen follows when it recovers. The returned handle can unsubscribe or change local price bucket aggregation without reconnecting.
     *
     * `depth` above 500 throws ValidationError, since only REST serves 1000 and 5000; other depths ride the smallest published channel depth that covers it (see ORDERBOOK_WS_DEPTHS); levels are sliced back to the requested depth locally.
     *
     * A refetched snapshot from an older `bookEpoch` than the book's is discarded and retried.
     *
     * Refetching is driven by reconnect events only. A feed that stays subscribed but stops publishing is indistinguishable from a quiet market, so it does not trigger onError or a refetch. Callers that must detect a stalled book need their own idle watchdog plus a REST refetch.
     */
    createSubscription(input: CreateOrderbookSubscriptionInput): OrderbookSubscription {
        const { symbolId, depth } = parse(GetOrderbookInputSchema, {
            symbolId: input.symbolId,
            depth: input.depth,
        });
        if (depth > 500) {
            throw new ValidationError(
                `depth must be at most 500 for a managed order book, got ${depth}`,
            );
        }
        const channelDepth = orderbookWsChannelDepth(depth);
        const channel = `public:spot:orderbook:deltas:depth:${channelDepth}:${symbolId}:proto`;

        const client = this.#client;
        const scales = this.#scales;
        let bidsMap: BookSide = new Map();
        let asksMap: BookSide = new Map();
        let currentBookSeq = 0n;
        let currentBookEpoch = 0n;
        let currentTs: number | undefined;
        let hasBook = false;
        // set when a delta does not chain onto the book; only the next reset recovers it.
        let awaitingReset = false;
        let bucketTicks: bigint | null = null;
        let snapshotGeneration = 0;
        let stream: SnapshotThenStreamSubscription | undefined;
        const queue = createCatalogRefreshQueue(
            scales,
            channel,
            input.onError,
            () => !(stream?.isDisposed() ?? false),
        );

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
                const bucketFloor = (priceTicks / bucket) * bucket;
                const bucketPrice =
                    side === "asks" && bucketFloor !== priceTicks
                        ? bucketFloor + bucket
                        : bucketFloor;
                agg.set(bucketPrice, (agg.get(bucketPrice) ?? 0n) + qtyScaled);
            }
            return sideToUI(agg, side, limit);
        }

        function emit(): void {
            try {
                input.onEvent({
                    symbolId,
                    depth,
                    bookSeq: currentBookSeq.toString(),
                    bookEpoch: currentBookEpoch.toString(),
                    available: true,
                    bids: sideToUIBucketed(bidsMap, "bids", depth, bucketTicks),
                    asks: sideToUIBucketed(asksMap, "asks", depth, bucketTicks),
                    ...(currentTs !== undefined ? { ts: currentTs } : {}),
                });
            } catch (error) {
                input.onError?.(publicationHandlerErrorContext(channel, error));
            }
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
            if (stream?.isReady() && hasBook) emit();
        }

        async function inputServiceFetch(): Promise<Proto.GetOrderBookResponse> {
            await scales.ready();
            // NOT_FOUND means the symbol does not exist; it reaches onError as a non-retryable error.
            const res = await client.getOrderBook({
                symbolId,
                depth: DepthTierCodec.inputToProto[channelDepth],
            });
            // An unavailable book's levels are unknown, not empty: fail the snapshot so it is retried.
            if (!isBookAvailable(res)) {
                throw new ServiceUnavailableError(
                    `Order book for symbol ${symbolId} is not available yet`,
                );
            }
            if (res.bookEpoch < currentBookEpoch) {
                throw new ServiceUnavailableError(
                    `Order book snapshot for symbol ${symbolId} is from an older epoch`,
                );
            }
            if (!hasKnownSymbol(scales, symbolId)) {
                await scales.refreshAfterMiss?.();
            }
            return res;
        }

        /**
         * Applies a delta only when it chains onto the current book (`bookSeqStart` equals the
         * last applied `bookSeqEnd`) or is a reset. A delta that does not chain leaves the book
         * waiting for the next reset, which the server sends periodically and after a gap.
         */
        function handleDelta(delta: Proto.OrderBookDelta, fromBuffer: boolean): void {
            if (delta.reset) {
                // a buffered reset from before the snapshot must not rewind a newer snapshot;
                // a live reset always replaces the book, even after an epoch restart lowers bookSeq.
                if (fromBuffer && delta.bookSeqEnd <= currentBookSeq) return;
                bidsMap.clear();
                asksMap.clear();
                awaitingReset = false;
                hasBook = true;
            } else {
                if (delta.bookSeqEnd <= currentBookSeq) return;
                if (awaitingReset || delta.bookSeqStart !== currentBookSeq) {
                    awaitingReset = true;
                    return;
                }
            }

            applySideDelta(bidsMap, delta.bids);
            applySideDelta(asksMap, delta.asks);

            currentBookSeq = delta.bookSeqEnd;
            currentTs = tsObjToMs(delta.ts);
            emit();
        }

        setBucket(input.bucket);
        stream = snapshotThenStream({
            realtime: this.#realtime,
            channel,
            schema: Proto.OrderBookDeltaSchema,
            maxBufferedPublications: 200,
            snapshotErrorLog: "Failed to fetch orderbook",
            // GetOrderBook answers unavailable while the book is (re)built; keep asking until it is ready.
            snapshotRetry: {
                maxAttempts: Number.POSITIVE_INFINITY,
                delayMs: 1_000,
                maxDelayMs: 8_000,
            },
            // A snapshot error that is not retried (a 500) leaves the book to the server's next
            // reset; clear any stale state so setBucket stays quiet until that reset arrives.
            snapshotFailureMode: (error) => {
                if (!(error instanceof PolyesterError) || error.retryable) return "wait";
                snapshotGeneration++;
                bidsMap.clear();
                asksMap.clear();
                currentBookSeq = 0n;
                currentTs = undefined;
                hasBook = false;
                awaitingReset = true;
                return "live";
            },
            fetchSnapshot: inputServiceFetch,
            readPublication: (delta) => [delta],
            applySnapshot: (snapshot, bufferedDeltas) => {
                snapshotGeneration++;
                bidsMap = levelsToMap(snapshot.bids);
                asksMap = levelsToMap(snapshot.asks);
                currentBookSeq = snapshot.bookSeq;
                currentBookEpoch = snapshot.bookEpoch;
                currentTs = tsObjToMs(snapshot.ts);
                hasBook = true;
                awaitingReset = false;
                emit();
                for (const delta of bufferedDeltas) {
                    if (stream?.isDisposed()) return;
                    handleDelta(delta, true);
                }
            },
            applyLivePublications: (deltas) => {
                const generation = snapshotGeneration;
                queue(!hasKnownSymbol(scales, symbolId), () => {
                    if (
                        generation !== snapshotGeneration ||
                        !stream?.isReady() ||
                        stream.isDisposed()
                    ) {
                        return;
                    }
                    for (const delta of deltas) {
                        if (
                            generation !== snapshotGeneration ||
                            !stream?.isReady() ||
                            stream.isDisposed()
                        ) {
                            return;
                        }
                        handleDelta(delta, false);
                    }
                });
            },
            onOpen: () => {
                snapshotGeneration++;
                input.onOpen?.();
            },
            onClose: () => {
                snapshotGeneration++;
                input.onClose?.();
            },
            onError: input.onError,
        });

        function dispose(): void {
            stream?.unsubscribe();
        }

        return { unsubscribe: dispose, setBucket };
    }
}

/**
 * Whether a snapshot's levels are the book. A snapshot carrying levels is current even with
 * `available` false, which is how servers that predate the field encode every snapshot.
 */
function isBookAvailable(res: Proto.GetOrderBookResponse): boolean {
    return res.available || res.bids.length > 0 || res.asks.length > 0;
}
