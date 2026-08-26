import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { ResourceNotFoundError } from "../../shared/errors.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    realtimeClientStub,
    rejectingUnaryTransport,
    unaryTransport,
} from "../../testing/service-harness.js";
import { OrderbookService } from "./orderbook.js";
import { ORDERBOOK_WS_DEPTHS, orderbookWsChannelDepth } from "./orderbook.codecs.js";

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

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

describe("OrderbookService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes get requests, forwards signals, and parses snapshots into decimals", async () => {
        const controller = new AbortController();
        const transport = unaryTransport({
            symbolId: 101,
            bookSeq: 12n,
            bids: [{ priceTicks: 100_000_000n, qtyScaled: 100_000_000n }],
            asks: [{ priceTicks: 100_250_000n, qtyScaled: 50_000_000n }],
        });
        const service = new OrderbookService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(
            service.get({ symbolId: 101, depth: 37 }, { signal: controller.signal }),
        ).resolves.toMatchObject({
            symbolId: 101,
            depth: 50,
            bookSeq: "12",
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
                depth: Proto.Depth.DEPTH_50,
            },
        });
    });

    it("rejects malformed backend snapshots", async () => {
        const transport = unaryTransport({
            symbolId: 101,
            bookSeq: 12n,
            bids: [{ priceTicks: 100_000_000n }],
            asks: [],
        });
        const service = new OrderbookService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.get({ symbolId: 101 })).rejects.toThrow();
    });

    it("reports snapshot failures without emitting an empty ready book", async () => {
        const realtime = realtimeClientStub();
        const service = new OrderbookService(
            rejectingUnaryTransport(new Error("snapshot unavailable")),
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
            error: {
                code: 0,
                message: "snapshot unavailable",
            },
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

    it("treats a missing orderbook snapshot as an empty ready book", async () => {
        const realtime = realtimeClientStub();
        const service = new OrderbookService(
            rejectingUnaryTransport(new ResourceNotFoundError("orderbook not found")),
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

        expect(onError).not.toHaveBeenCalled();
        expect(onEvent).toHaveBeenCalledOnce();
        expect(onEvent).toHaveBeenCalledWith({
            symbolId: 101,
            depth: 50,
            bookSeq: "0",
            bids: [],
            asks: [],
        });
        subscription.unsubscribe();
    });

    it("uses the public delta channel, callbacks, and parsed publications for subscriptions", async () => {
        const realtime = realtimeClientStub();
        const transport = unaryTransport({
            symbolId: 101,
            bookSeq: 1n,
            bids: [{ priceTicks: 100_000_000n, qtyScaled: 100_000_000n }],
            asks: [{ priceTicks: 101_000_000n, qtyScaled: 50_000_000n }],
        });
        const service = new OrderbookService(transport.transport, realtime.realtime, testScales());
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();

        const subscription = service.createSubscription({
            symbolId: 101,
            depth: 1000,
            bucket: "0.01",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("public:spot:orderbook:deltas:depth:500:101:proto");
        expect(realtime.params?.schema).toBe(Proto.OrderBookDeltaSchema);
        realtime.params?.onConnected?.();
        realtime.params?.onError?.({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });

        await flushMicrotasks();

        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("getOrderBook");
        expect(captured).toMatchObject({
            message: {
                symbolId: 101,
                depth: Proto.Depth.DEPTH_500,
            },
        });
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
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
                bookSeqStart: 2n,
                bookSeqEnd: 2n,
                bids: [{ priceTicks: 100_500_000n, qtyScaled: 25_000_000n }],
                asks: [{ priceTicks: 101_000_000n, qtyScaled: 0n }],
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

    it("routes emit failures for unknown symbol ids to the subscription error callback", async () => {
        const realtime = realtimeClientStub();
        const transport = unaryTransport({
            symbolId: 999,
            bookSeq: 1n,
            bids: [{ priceTicks: 100_000_000n, qtyScaled: 100_000_000n }],
            asks: [],
        });
        const service = new OrderbookService(transport.transport, realtime.realtime, testScales());
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
        const transport = unaryTransport({ symbolId: 101, bookSeq: 5n, bids: [], asks: [] });
        const service = new OrderbookService(transport.transport, realtime.realtime, testScales());

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
            depth: Proto.Depth.DEPTH_20,
        });
        subscription.unsubscribe();
    });

    it("slices the deeper feed back down to the requested depth", async () => {
        const realtime = realtimeClientStub();
        const bids = Array.from({ length: 20 }, (_, i) => ({
            priceTicks: BigInt(100_000_000 - i * 100),
            qtyScaled: 1_000_000n,
        }));
        const transport = unaryTransport({ symbolId: 101, bookSeq: 7n, bids, asks: [] });
        const service = new OrderbookService(transport.transport, realtime.realtime, testScales());
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
            unaryTransport({}).transport,
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
