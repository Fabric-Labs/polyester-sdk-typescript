import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import {
    InternalServerError,
    ResourceNotFoundError,
    ServiceUnavailableError,
    ValidationError,
} from "../../shared/errors.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    realtimeClientStub,
    rejectingUnaryTransport,
    unaryTransport,
} from "../../testing/service-harness.js";
import { OrderbookService } from "./orderbook.js";
import { ORDERBOOK_WS_DEPTHS, orderbookWsChannelDepth } from "./orderbook.codecs.js";
import { DepthTier } from "../../gen/polyester/type/v1/depth_tier_pb.js";

const BTC = {
    symbol: "BTC",
    ledgerId: 1,
    name: "Bitcoin",
    quantityDisplayDecimals: 5,
    quantityScale: 8,
};

const USDT = {
    symbol: "USDT",
    ledgerId: 2,
    name: "Tether",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};

const BTC_USDT = {
    symbolId: 101,
    symbol: "BTC-USDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    tickSize: "0.01",
    stepSize: "0.0001",
    minNotionalQuote: "10",
    minQtyBase: "0.0001",
    allowBuyFeeFromBase: false,
    defaultMarketSlippagePctBuy: 1,
    defaultMarketSlippagePctSell: 1,
    maxClientRefDriftPct: 1,
    baseQuantityScale: 8,
    quoteQuantityScale: 6,
    status: "enabled",
} as const;

function testScales() {
    return createCatalogSdkScales(() =>
        createTestCatalog({ assets: [BTC, USDT], pairs: [BTC_USDT] }),
    );
}

type BookSnapshot = MessageInitShape<typeof Proto.GetOrderBookResponseSchema>;

/** Serves snapshots as real messages, so fields the test omits read as proto defaults. */
function bookTransport(response: BookSnapshot | ((call: unknown, index: number) => BookSnapshot)) {
    return unaryTransport((call, index) =>
        create(
            Proto.GetOrderBookResponseSchema,
            typeof response === "function" ? response(call, index) : response,
        ),
    );
}

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

describe("OrderbookService", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("reports a book that is being built as unavailable rather than empty", async () => {
        const transport = bookTransport({ symbolId: 101, bookSeq: 0n, bids: [], asks: [] });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );
        await expect(service.get({ symbolId: 101 })).resolves.toMatchObject({
            symbolId: 101,
            bookSeq: "0",
            available: false,
            bids: [],
            asks: [],
        });
    });

    it("treats a snapshot carrying levels as available when the server omits the flag", async () => {
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 3n,
            bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
            asks: [],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );
        await expect(service.get({ symbolId: 101 })).resolves.toMatchObject({ available: true });
    });

    it("sends depth as its tier, reports the served tier, forwards signals, and parses snapshots into decimals", async () => {
        const controller = new AbortController();
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 12n,
            bookEpoch: 3n,
            depth: DepthTier.DEPTH_1000,
            available: true,
            bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
            asks: [{ priceTicks: 100_250_000_000n, qtyScaled: 50_000_000n }],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(
            service.get({ symbolId: 101, depth: 1000 }, { signal: controller.signal }),
        ).resolves.toMatchObject({
            symbolId: 101,
            depth: 1000,
            bookSeq: "12",
            bookEpoch: "3",
            bids: [
                {
                    price: "100",
                    qty: "1",
                },
            ],
            asks: [
                {
                    price: "100.25",
                    qty: "0.5",
                },
            ],
        });

        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("getOrderBook");
        expect(captured).toMatchObject({
            signal: controller.signal,
            message: {
                symbolId: 101,
                depth: DepthTier.DEPTH_1000,
            },
        });
    });

    it("refuses a depth that is no tier before sending", async () => {
        const transport = bookTransport({ symbolId: 101 });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );
        await expect(service.get({ symbolId: 101, depth: 37 as 50 })).rejects.toThrow(
            ValidationError,
        );
        expect(transport.lastCall()).toBeUndefined();
    });

    it("reports the requested tier when the server leaves the served tier unset", async () => {
        const transport = bookTransport({ symbolId: 101, available: true });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );
        await expect(service.get({ symbolId: 101, depth: 5 })).resolves.toMatchObject({
            depth: 5,
        });
        expect(transport.lastCall()?.message).toMatchObject({ depth: DepthTier.DEPTH_5 });
    });

    it("rejects malformed backend snapshots", async () => {
        const transport = unaryTransport({
            symbolId: 101,
            bookSeq: 12n,
            available: true,
            bids: [{ priceTicks: 100_000_000_000n }],
            asks: [],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.get({ symbolId: 101 })).rejects.toThrow();
    });

    it("reports snapshot failures without emitting an empty ready book", async () => {
        const realtime = realtimeClientStub();
        const service = new OrderbookService(
            { publicApi: rejectingUnaryTransport(new Error("snapshot unavailable")) },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({
            symbolId: 101,
            depth: 50,
            onEvent,
            onError,
        });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            type: "snapshot",
            error: expect.objectContaining({ message: "snapshot unavailable" }),
        });

        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 1,
                bookSeqStart: 1n,
                bookSeqEnd: 1n,
                bids: [],
                asks: [],
                reset: false,
            }),
        );
        await flushMicrotasks();

        expect(onEvent).not.toHaveBeenCalled();
        subscription.unsubscribe();
    });

    it("makes catalog readiness part of the snapshot cycle", async () => {
        let resolveReady: (() => void) | undefined;
        const ready = new Promise<void>((resolve) => {
            resolveReady = resolve;
        });
        const scales = { ...testScales(), ready: () => ready };
        const realtime = realtimeClientStub();
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 1n,
            available: true,
            bids: [],
            asks: [],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            scales,
        );
        const onEvent = vi.fn();

        const subscription = service.createSubscription({ symbolId: 101, onEvent });
        realtime.params?.onConnected?.();
        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 1n,
                bookSeqEnd: 2n,
            }),
        );
        await flushMicrotasks();

        expect(transport.unary).not.toHaveBeenCalled();
        expect(onEvent).not.toHaveBeenCalled();

        resolveReady?.();
        await ready;
        await flushMicrotasks();

        expect(transport.unary).toHaveBeenCalledOnce();
        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({ bookSeq: "2", symbolId: 101 }),
        );
        subscription.unsubscribe();
    });

    it("reports an unknown symbol through onError instead of an empty book", async () => {
        const realtime = realtimeClientStub();
        const service = new OrderbookService(
            {
                publicApi: rejectingUnaryTransport(
                    new ResourceNotFoundError("orderbook not found"),
                ),
            },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({
            symbolId: 101,
            depth: 50,
            onEvent,
            onError,
        });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0]?.[0]).toMatchObject({ type: "snapshot" });
        expect(onError.mock.calls[0]?.[0].error).toBeInstanceOf(ResourceNotFoundError);
        subscription.unsubscribe();
    });

    it("refuses a managed depth above 500 before subscribing", () => {
        const realtime = realtimeClientStub();
        const service = new OrderbookService(
            { publicApi: bookTransport({ symbolId: 101 }).transport },
            realtime.realtime,
            testScales(),
        );
        expect(() =>
            service.createSubscription({ symbolId: 101, depth: 1000, onEvent: () => {} }),
        ).toThrow(ValidationError);
        expect(realtime.params).toBeUndefined();
    });

    it("uses the public delta channel, callbacks, and parsed publications for subscriptions", async () => {
        const realtime = realtimeClientStub();
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 1n,
            available: true,
            bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
            asks: [{ priceTicks: 101_000_000_000n, qtyScaled: 50_000_000n }],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({
            symbolId: 101,
            depth: 500,
            bucket: "0.01",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("public:spot:orderbook:deltas:depth:500:101:proto");
        expect(realtime.params?.schema).toBe(Proto.OrderBookDeltaSchema);
        realtime.params?.onConnected?.();
        const transportError = new Error("boom");
        realtime.params?.onError?.({
            channel: "channel",
            type: "transport",
            error: transportError,
        });

        await flushMicrotasks();

        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("getOrderBook");
        expect(captured).toMatchObject({
            message: {
                symbolId: 101,
                depth: DepthTier.DEPTH_500,
            },
        });
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith({
            channel: "channel",
            type: "transport",
            error: transportError,
        });
        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                depth: 500,
                bookSeq: "1",
                bids: [
                    expect.objectContaining({
                        price: "100",
                        qty: "1",
                    }),
                ],
            }),
        );

        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 1,
                bookSeqStart: 1n,
                bookSeqEnd: 2n,
                bids: [{ priceTicks: 100_500_000_000n, qtyScaled: 25_000_000n }],
                asks: [{ priceTicks: 101_000_000_000n, qtyScaled: 0n }],
                reset: false,
            }),
        );
        await flushMicrotasks();

        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                bookSeq: "2",
                asks: [],
                bids: expect.arrayContaining([
                    expect.objectContaining({
                        price: "100.5",
                        qty: "0.25",
                    }),
                ]),
            }),
        );

        realtime.params?.onDisconnected?.();
        expect(onClose).toHaveBeenCalledTimes(1);

        subscription.unsubscribe();
    });

    it("floors bid buckets and ceils ask buckets so aggregation cannot cross the book", async () => {
        const realtime = realtimeClientStub();
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 1n,
            available: true,
            bids: [{ priceTicks: 100_040_000_000n, qtyScaled: 100_000_000n }],
            asks: [{ priceTicks: 100_060_000_000n, qtyScaled: 50_000_000n }],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();

        const subscription = service.createSubscription({
            symbolId: 101,
            bucket: "0.1",
            onEvent,
        });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                bids: [expect.objectContaining({ price: "100" })],
                asks: [expect.objectContaining({ price: "100.1" })],
            }),
        );
        subscription.unsubscribe();
    });

    it("holds the book after a sequence gap until the next reset, without refetching", async () => {
        const realtime = realtimeClientStub();
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 10n,
            available: true,
            bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
            asks: [],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();

        const subscription = service.createSubscription({ symbolId: 101, onEvent });
        realtime.params?.onConnected?.();
        const delta = (
            start: bigint,
            end: bigint,
            extra: Pick<MessageInitShape<typeof Proto.OrderBookDeltaSchema>, "bids" | "reset"> = {},
        ) =>
            realtime.params?.onPublication(
                create(Proto.OrderBookDeltaSchema, {
                    symbolId: 101,
                    bookSeqStart: start,
                    bookSeqEnd: end,
                    bids: [{ priceTicks: 99_000_000_000n, qtyScaled: 100_000_000n }],
                    ...extra,
                }),
            );
        // Dropped: ends at or before the snapshot.
        delta(9n, 10n);
        // Overlaps the snapshot without starting at it: not applied, waits for a reset.
        delta(9n, 11n);
        // Chains onto the dropped delta, so it still waits.
        delta(11n, 12n);
        await flushMicrotasks();

        expect(transport.unary).toHaveBeenCalledOnce();
        expect(onEvent).toHaveBeenCalledOnce();
        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                bookSeq: "10",
                bids: [expect.objectContaining({ price: "100" })],
            }),
        );

        delta(0n, 13n, {
            reset: true,
            bids: [{ priceTicks: 98_000_000_000n, qtyScaled: 100_000_000n }],
        });
        delta(13n, 14n, { bids: [{ priceTicks: 97_000_000_000n, qtyScaled: 100_000_000n }] });
        await flushMicrotasks();

        expect(transport.unary).toHaveBeenCalledOnce();
        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                bookSeq: "14",
                bids: [
                    expect.objectContaining({ price: "98" }),
                    expect.objectContaining({ price: "97" }),
                ],
            }),
        );
        subscription.unsubscribe();
    });

    it("retries a failed snapshot and replays deltas buffered during recovery", async () => {
        vi.useFakeTimers();
        const realtime = realtimeClientStub();
        const transport = bookTransport((_call, index) => {
            if (index === 0) throw new Error("snapshot unavailable");
            return { symbolId: 101, bookSeq: 10n, available: true, bids: [], asks: [] };
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({
            symbolId: 101,
            onEvent,
            onError,
        });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onError).toHaveBeenCalledOnce();
        expect(onEvent).not.toHaveBeenCalled();
        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 10n,
                bookSeqEnd: 11n,
                bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
            }),
        );

        await vi.advanceTimersByTimeAsync(1_000);
        await flushMicrotasks();

        expect(transport.unary).toHaveBeenCalledTimes(2);
        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                bookSeq: "11",
                bids: [expect.objectContaining({ price: "100", qty: "1" })],
            }),
        );
        subscription.unsubscribe();
    });

    it("rebuilds from the next reset after a snapshot error that is not retried", async () => {
        vi.useFakeTimers();
        const realtime = realtimeClientStub();
        const transport = bookTransport(() => {
            throw new InternalServerError("An internal error occurred.");
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({ symbolId: 101, onEvent, onError });
        realtime.params?.onConnected?.();
        await flushMicrotasks();
        await vi.advanceTimersByTimeAsync(10_000);

        expect(transport.unary).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledOnce();
        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 5n,
                bookSeqEnd: 6n,
                bids: [{ priceTicks: 99_000_000_000n, qtyScaled: 100_000_000n }],
            }),
        );
        expect(onEvent).not.toHaveBeenCalled();
        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 0n,
                bookSeqEnd: 7n,
                reset: true,
                bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
            }),
        );

        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                bookSeq: "7",
                bids: [expect.objectContaining({ price: "100", qty: "1" })],
            }),
        );
        subscription.unsubscribe();
    });

    it("retries an unavailable snapshot instead of emitting an empty book", async () => {
        vi.useFakeTimers();
        const realtime = realtimeClientStub();
        const transport = bookTransport((_call, index) =>
            index === 0
                ? { symbolId: 101, bookSeq: 0n, available: false, bids: [], asks: [] }
                : {
                      symbolId: 101,
                      bookSeq: 4n,
                      available: true,
                      bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
                      asks: [],
                  },
        );
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({ symbolId: 101, onEvent, onError });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            error: expect.any(ServiceUnavailableError),
        });

        await vi.advanceTimersByTimeAsync(1_000);
        await flushMicrotasks();

        expect(transport.unary).toHaveBeenCalledTimes(2);
        expect(onEvent).toHaveBeenCalledOnce();
        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                bookSeq: "4",
                available: true,
                bids: [expect.objectContaining({ price: "100", qty: "1" })],
            }),
        );
        subscription.unsubscribe();
    });

    it("discards a refetched snapshot from an older epoch and retries", async () => {
        vi.useFakeTimers();
        const realtime = realtimeClientStub();
        const snapshots = [
            { bookEpoch: 5n, bookSeq: 9n, price: 100_000_000_000n },
            { bookEpoch: 4n, bookSeq: 50n, price: 90_000_000_000n },
            { bookEpoch: 6n, bookSeq: 1n, price: 101_000_000_000n },
        ];
        const transport = bookTransport((_call, index) => {
            const s = snapshots[index] ?? snapshots[2]!;
            return {
                symbolId: 101,
                bookEpoch: s.bookEpoch,
                bookSeq: s.bookSeq,
                available: true,
                bids: [{ priceTicks: s.price, qtyScaled: 100_000_000n }],
                asks: [],
            };
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({ symbolId: 101, onEvent, onError });
        realtime.params?.onConnected?.();
        await flushMicrotasks();
        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({ bookEpoch: "5", bookSeq: "9" }),
        );

        realtime.params?.onDisconnected?.();
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenLastCalledWith(
            expect.objectContaining({ error: expect.any(ServiceUnavailableError) }),
        );

        await vi.advanceTimersByTimeAsync(1_000);
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledTimes(2);
        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                bookEpoch: "6",
                bookSeq: "1",
                bids: [expect.objectContaining({ price: "101" })],
            }),
        );
        subscription.unsubscribe();
    });

    it("ignores stale reset deltas without rewinding a newer snapshot", async () => {
        const realtime = realtimeClientStub();
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 100n,
            available: true,
            bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
            asks: [],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();

        const subscription = service.createSubscription({ symbolId: 101, onEvent });
        realtime.params?.onConnected?.();
        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 95n,
                bookSeqEnd: 95n,
                reset: true,
            }),
        );
        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 96n,
                bookSeqEnd: 96n,
                bids: [{ priceTicks: 99_000_000_000n, qtyScaled: 100_000_000n }],
            }),
        );
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledOnce();
        expect(onEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({
                bookSeq: "100",
                bids: [expect.objectContaining({ price: "100", qty: "1" })],
            }),
        );
        subscription.unsubscribe();
    });

    it("routes emit failures for unknown symbol ids to the subscription error callback", async () => {
        const realtime = realtimeClientStub();
        const transport = bookTransport({
            symbolId: 999,
            bookSeq: 1n,
            available: true,
            bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
            asks: [],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({
            symbolId: 999,
            depth: 50,
            onEvent,
            onError,
        });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "public:spot:orderbook:deltas:depth:50:999:proto",
            type: "publication_handler",
        });
        expect(onError.mock.calls[0]?.[0].error.code).toBe("CATALOG_LOOKUP_MISS");
        subscription.unsubscribe();
    });

    it("routes an unpublished depth to the smallest published channel depth", async () => {
        const realtime = realtimeClientStub();
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 5n,
            available: true,
            bids: [],
            asks: [],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );

        const subscription = service.createSubscription({
            symbolId: 101,
            depth: 10,
            onEvent: vi.fn(),
        });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(realtime.params?.channel).toBe("public:spot:orderbook:deltas:depth:20:101:proto");
        expect(transport.lastCall()?.message).toMatchObject({
            symbolId: 101,
            depth: DepthTier.DEPTH_20,
        });
        subscription.unsubscribe();
    });

    it("slices the deeper feed back down to the requested depth", async () => {
        const realtime = realtimeClientStub();
        const bids = Array.from({ length: 20 }, (_, i) => ({
            priceTicks: BigInt(100_000_000_000 - i * 100_000),
            qtyScaled: 1_000_000n,
        }));
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 7n,
            available: true,
            bids,
            asks: [],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();

        const subscription = service.createSubscription({
            symbolId: 101,
            depth: 10,
            onEvent,
        });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledOnce();
        expect(onEvent.mock.calls[0]?.[0]).toMatchObject({ depth: 10 });
        expect(onEvent.mock.calls[0]?.[0].bids).toHaveLength(10);
        subscription.unsubscribe();
    });

    it("uses the caller-provided symbol id for realtime routing", () => {
        const realtime = realtimeClientStub();
        const service = new OrderbookService(
            { publicApi: bookTransport({}).transport },
            realtime.realtime,
            testScales(),
        );
        const unsubscribe = service.subscribe({
            symbolId: 999,
            onEvent: vi.fn(),
        });

        expect(realtime.params?.channel).toBe("public:spot:orderbook:deltas:depth:50:999:proto");
        unsubscribe();
    });

    it("applies a live reset even when bookSeqEnd restarts at or below currentBookSeq", async () => {
        const realtime = realtimeClientStub();
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 100n,
            bookEpoch: 2n,
            available: true,
            bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
            asks: [],
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();

        const subscription = service.createSubscription({ symbolId: 101, onEvent });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        // new epoch restarts bookSeq at 1 (<= 100) via a live reset
        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 0n,
                bookSeqEnd: 1n,
                reset: true,
                bids: [{ priceTicks: 105_000_000_000n, qtyScaled: 200_000_000n }],
            }),
        );
        // subsequent delta chains onto the restarted bookSeq
        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 1n,
                bookSeqEnd: 2n,
                bids: [{ priceTicks: 106_000_000_000n, qtyScaled: 300_000_000n }],
            }),
        );
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledTimes(3);
        expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
            bookSeq: "1",
            bids: [expect.objectContaining({ price: "105", qty: "2" })],
        });
        expect(onEvent.mock.calls[2]?.[0]).toMatchObject({
            bookSeq: "2",
            bids: [
                expect.objectContaining({ price: "106", qty: "3" }),
                expect.objectContaining({ price: "105", qty: "2" }),
            ],
        });
        subscription.unsubscribe();
    });

    it("carries ts from snapshots and deltas, and omits ts when unset", async () => {
        const realtime = realtimeClientStub();
        const transport = bookTransport({
            symbolId: 101,
            bookSeq: 10n,
            available: true,
            bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
            asks: [],
            ts: { seconds: 1_700_000_000n, nanos: 123_000_000 },
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();

        const subscription = service.createSubscription({ symbolId: 101, onEvent });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onEvent.mock.calls[0]?.[0].ts).toBe(1_700_000_000_123);

        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 10n,
                bookSeqEnd: 11n,
                bids: [{ priceTicks: 101_000_000_000n, qtyScaled: 100_000_000n }],
                ts: { seconds: 1_700_000_001n, nanos: 500_000_000 },
            }),
        );
        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 11n,
                bookSeqEnd: 12n,
                bids: [{ priceTicks: 102_000_000_000n, qtyScaled: 100_000_000n }],
            }),
        );
        await flushMicrotasks();

        expect(onEvent.mock.calls[1]?.[0].ts).toBe(1_700_000_001_500);
        expect("ts" in (onEvent.mock.calls[2]?.[0] ?? {})).toBe(false);
        subscription.unsubscribe();
    });

    it("does not emit from setBucket after a failed snapshot until a reset rebuilds the book", async () => {
        const realtime = realtimeClientStub();
        let attempt = 0;
        const transport = bookTransport(() => {
            attempt++;
            if (attempt === 1) {
                throw new InternalServerError("snapshot failed", { status: 500 });
            }
            return {
                symbolId: 101,
                bookSeq: 10n,
                available: true,
                bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
                asks: [],
            };
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({ symbolId: 101, onEvent, onError });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onError).toHaveBeenCalledOnce();
        subscription.setBucket("1");
        expect(onEvent).not.toHaveBeenCalled();

        // a reset rebuilds the book; subsequent setBucket emits normally
        realtime.params?.onPublication(
            create(Proto.OrderBookDeltaSchema, {
                symbolId: 101,
                bookSeqStart: 0n,
                bookSeqEnd: 5n,
                reset: true,
                bids: [{ priceTicks: 100_500_000_000n, qtyScaled: 100_000_000n }],
            }),
        );
        await flushMicrotasks();
        expect(onEvent).toHaveBeenCalledTimes(1);

        subscription.setBucket("1");
        expect(onEvent).toHaveBeenCalledTimes(2);
        expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
            bookSeq: "5",
            bids: [expect.objectContaining({ price: "100", qty: "1" })],
        });
        subscription.unsubscribe();
    });

    it("does not emit stale levels from setBucket after a failed reconnect snapshot", async () => {
        const realtime = realtimeClientStub();
        let attempt = 0;
        const transport = bookTransport(() => {
            attempt++;
            if (attempt === 1) {
                return {
                    symbolId: 101,
                    bookSeq: 10n,
                    available: true,
                    bids: [{ priceTicks: 100_000_000_000n, qtyScaled: 100_000_000n }],
                    asks: [],
                };
            }
            throw new InternalServerError("reconnect snapshot failed", { status: 500 });
        });
        const service = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({ symbolId: 101, onEvent, onError });
        realtime.params?.onConnected?.();
        await flushMicrotasks();
        expect(onEvent).toHaveBeenCalledTimes(1);

        realtime.params?.onConnected?.();
        await flushMicrotasks();
        expect(onError).toHaveBeenCalledOnce();

        subscription.setBucket("1");
        expect(onEvent).toHaveBeenCalledTimes(1);
        subscription.unsubscribe();
    });

    it("refreshes the catalog on miss for newly listed pairs in get() and subscribe()", async () => {
        const NEW_PAIR = {
            ...BTC_USDT,
            symbolId: 202,
            symbol: "ETH-USDT",
        } as const;
        const withRefresh = () => {
            let currentCatalog = createTestCatalog({ assets: [BTC, USDT], pairs: [BTC_USDT] });
            const refresh = vi.fn(async () => {
                currentCatalog = createTestCatalog({
                    assets: [BTC, USDT],
                    pairs: [BTC_USDT, NEW_PAIR],
                });
                return currentCatalog.snapshot();
            });
            currentCatalog.refresh = refresh;
            return { scales: createCatalogSdkScales(() => currentCatalog), refresh };
        };

        const transport = bookTransport({
            symbolId: 202,
            bookSeq: 1n,
            available: true,
            bids: [{ priceTicks: 2_000_000_000_000n, qtyScaled: 100_000_000n }],
            asks: [],
        });
        const realtime = realtimeClientStub();
        const subCatalog = withRefresh();
        const subService = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            subCatalog.scales,
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        const subscription = subService.createSubscription({ symbolId: 202, onEvent, onError });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(subCatalog.refresh).toHaveBeenCalledOnce();
        expect(onError).not.toHaveBeenCalled();
        expect(onEvent).toHaveBeenCalledOnce();
        expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
            symbolId: 202,
            bids: [expect.objectContaining({ price: "2000", qty: "1" })],
        });
        subscription.unsubscribe();

        const getCatalog = withRefresh();
        const getService = new OrderbookService(
            { publicApi: transport.transport },
            realtime.realtime,
            getCatalog.scales,
        );
        const book = await getService.get({ symbolId: 202 });
        expect(getCatalog.refresh).toHaveBeenCalledOnce();
        expect(book.bids).toEqual([expect.objectContaining({ price: "2000", qty: "1" })]);
    });
});

describe("orderbookWsChannelDepth", () => {
    it("maps published depths to themselves", () => {
        expect(ORDERBOOK_WS_DEPTHS.map(orderbookWsChannelDepth)).toEqual([...ORDERBOOK_WS_DEPTHS]);
    });

    it("lifts unpublished depths onto the next published channel depth", () => {
        // 5, 10, 100 and 1000 are accepted by the REST snapshot but have no delta publisher.
        expect(orderbookWsChannelDepth(5)).toBe(20);
        expect(orderbookWsChannelDepth(10)).toBe(20);
        expect(orderbookWsChannelDepth(100)).toBe(200);
        expect(orderbookWsChannelDepth(1000)).toBe(500);
        expect(orderbookWsChannelDepth(37)).toBe(50);
    });
});
