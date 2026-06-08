import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import * as Proto from "../../gen/marketoverview/v1/marketoverview_pb.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { MarketOverviewService } from "./market-overview.js";

const btc = {
    symbol: "BTC",
    ledgerId: 1,
    name: "Bitcoin",
    quantityDisplayDecimals: 8,
    quantityScale: 8,
};

const usdt = {
    symbol: "USDT",
    ledgerId: 2,
    name: "Tether USD",
    quantityDisplayDecimals: 6,
    quantityScale: 6,
};

const btcUsdtPair: EnrichedPairConfig = {
    symbolId: 101,
    symbol: "BTC-USDT",
    baseAsset: btc,
    quoteAsset: usdt,
    tickSize: "0.000001",
    stepSize: "0.00000001",
    minNotionalQuote: "1",
    minQtyBase: "0.00000001",
    allowBuyFeeFromReceived: false,
    defaultMarketSlippagePctBuy: 0,
    defaultMarketSlippagePctSell: 0,
    maxClientRefDriftPct: 0,
    listingAt: 1_600_000_000_000,
    delistingAt: null,
    status: "enabled",
};

function seedPairCatalog() {
    return createTestCatalog({ assets: [btc, usdt], pairs: [btcUsdtPair] });
}

function market(overrides: Record<string, unknown> = {}) {
    return {
        symbolId: 101,
        symbol: "BTC-USDT",
        lastPriceTicks: 1_234_567n,
        lastTradeTsNs: 1_700_000_000_000_000_000n,
        change24hBp: 123,
        high24hTicks: 2_000_000n,
        low24hTicks: 1_000_000n,
        volume24hBaseScaled: 123_456_789n,
        volume24hQuoteScaled: 987_654_321n,
        listedTsNs: 1_600_000_000_000_000_000n,
        bestBidTicks: 1_200_000n,
        bestBidQtyScaled: 10_000_000n,
        bestAskTicks: 1_300_000n,
        bestAskQtyScaled: 20_000_000n,
        sparklines: [],
        ...overrides,
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });
    return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

describe("MarketOverviewService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes list inputs to the proto request and parses market rows", async () => {
        const catalog = seedPairCatalog();
        const controller = new AbortController();
        const transport = unaryTransport({ markets: [market()], total: 1 });
        const service = new MarketOverviewService(
            transport.transport,
            realtimeClientStub().realtime,
            catalog,
        );

        const markets = await service.list(
            {
                symbols: [" BTC-USDT "],
                limit: 2,
                page: 3,
                orderBy: "last_price",
                sort: "asc",
                includeSparklines: false,
                sparklineIntervals: ["1h", "1w"],
            },
            { signal: controller.signal },
        );

        expect(transport.lastCall()?.message).toEqual({
            symbols: ["BTC-USDT"],
            limit: 2,
            page: 3,
            orderBy: Proto.MarketOrderBy.ORDER_BY_LAST_PRICE,
            sort: Proto.SortDirection.SORT_ASC,
            includeSparklines: false,
            sparklineIntervals: [
                Proto.SparklineInterval.SPARKLINE_1H,
                Proto.SparklineInterval.SPARKLINE_1W,
            ],
        });
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(markets).toEqual([
            expect.objectContaining({
                symbolId: 101,
                pair: "BTC-USDT",
                pairListingAt: 1_600_000_000_000,
                status: "enabled",
                lastPrice: "1.234567",
                volume24hBase: "1.23456789",
                volume24hQuote: "987.654321",
                bestBid: "1.2",
                bestAskQty: "0.2",
            }),
        ]);
    });

    it("returns an empty list for empty market overview responses", async () => {
        const transport = unaryTransport({ markets: [], total: 0 });
        const service = new MarketOverviewService(
            transport.transport,
            realtimeClientStub().realtime,
        );

        await expect(service.list()).resolves.toEqual([]);
        expect(transport.lastCall()?.message).toMatchObject({
            symbols: [],
            limit: 500,
            page: 1,
            includeSparklines: true,
            sparklineIntervals: [Proto.SparklineInterval.SPARKLINE_24H],
        });
    });

    it("rejects market rows with unmapped backend sparkline enums", async () => {
        const catalog = seedPairCatalog();
        const transport = unaryTransport({
            markets: [
                market({
                    sparklines: [
                        {
                            interval: Proto.SparklineInterval.SPARKLINE_INTERVAL_UNSPECIFIED,
                            closeTicks: [1n],
                        },
                    ],
                }),
            ],
            total: 1,
        });
        const service = new MarketOverviewService(
            transport.transport,
            realtimeClientStub().realtime,
            catalog,
        );

        await expect(service.list()).rejects.toThrow(
            /\[MarketOverviewSparklineSchema\]: invalid interval 0/,
        );
    });

    it("buffers subscription publications until the initial snapshot resolves", async () => {
        const catalog = seedPairCatalog();
        const snapshot = deferred<Record<string, unknown>>();
        const transport = unaryTransport(() => snapshot.promise);
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const service = new MarketOverviewService(transport.transport, realtime.realtime, catalog);

        service.subscribe({
            includeSparklines: false,
            sparklineIntervals: ["1h"],
            onEvent,
            onOpen,
        });

        expect(realtime.params?.channel).toBe("public:spot:market_overview:updates:proto");
        expect(realtime.params?.schema).toBe(Proto.MarketOverviewBatchSchema);
        expect(transport.lastCall()?.message).toMatchObject({
            includeSparklines: false,
            sparklineIntervals: [Proto.SparklineInterval.SPARKLINE_1H],
        });

        realtime.params?.onConnected?.();
        realtime.params?.onPublication(
            create(Proto.MarketOverviewBatchSchema, {
                markets: [market({ lastPriceTicks: 2_000_000n })],
                tsNs: 1n,
            }),
        );

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onEvent).not.toHaveBeenCalled();

        snapshot.resolve({ markets: [market({ lastPriceTicks: 1_000_000n })], total: 1 });
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledTimes(1);
        expect(onEvent.mock.calls[0]?.[0]).toEqual([
            expect.objectContaining({ symbolId: 101, lastPrice: "2" }),
        ]);
    });

    it("refetches snapshots on disconnect until unsubscribed", async () => {
        const catalog = seedPairCatalog();
        const transport = unaryTransport({ markets: [market()], total: 1 });
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onClose = vi.fn();
        const service = new MarketOverviewService(transport.transport, realtime.realtime, catalog);

        const unsubscribe = service.subscribe({ onEvent, onClose });
        await flushMicrotasks();

        expect(transport.unary).toHaveBeenCalledTimes(1);

        realtime.params?.onDisconnected?.();
        await flushMicrotasks();

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(transport.unary).toHaveBeenCalledTimes(2);

        unsubscribe();
        realtime.params?.onDisconnected?.();
        await flushMicrotasks();

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(transport.unary).toHaveBeenCalledTimes(2);
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("reports snapshot failures through the subscription error callback", async () => {
        const transport = unaryTransport(() => {
            throw new Error("snapshot unavailable");
        });
        const realtime = realtimeClientStub();
        const onError = vi.fn();
        const service = new MarketOverviewService(transport.transport, realtime.realtime);

        service.subscribe({ onEvent: vi.fn(), onError });
        await flushMicrotasks();

        expect(onError).toHaveBeenCalledWith({
            channel: "public:spot:market_overview:updates:proto",
            type: "snapshot",
            error: {
                code: 0,
                message: "snapshot unavailable",
            },
        });
    });

    it("reports reconnect snapshot failures through the subscription error callback", async () => {
        const catalog = seedPairCatalog();
        const transport = unaryTransport((_call, index) => {
            if (index === 0) return { markets: [market()], total: 1 };
            throw new Error("reconnect snapshot unavailable");
        });
        const realtime = realtimeClientStub();
        const onError = vi.fn();
        const service = new MarketOverviewService(transport.transport, realtime.realtime, catalog);

        service.subscribe({ onEvent: vi.fn(), onError });
        await flushMicrotasks();

        expect(onError).not.toHaveBeenCalled();

        realtime.params?.onDisconnected?.();
        await flushMicrotasks();

        expect(onError).toHaveBeenCalledWith({
            channel: "public:spot:market_overview:updates:proto",
            type: "snapshot",
            error: {
                code: 0,
                message: "reconnect snapshot unavailable",
            },
        });
    });

    it("throws on malformed market overview publications after snapshot readiness", async () => {
        const catalog = seedPairCatalog();
        const transport = unaryTransport({ markets: [market()], total: 1 });
        const realtime = realtimeClientStub();
        const service = new MarketOverviewService(transport.transport, realtime.realtime, catalog);

        service.subscribe({ onEvent: vi.fn() });
        await flushMicrotasks();

        expect(() =>
            realtime.params?.onPublication(
                create(Proto.MarketOverviewBatchSchema, {
                    markets: [
                        market({
                            sparklines: [
                                {
                                    interval:
                                        Proto.SparklineInterval.SPARKLINE_INTERVAL_UNSPECIFIED,
                                    closeTicks: [1n],
                                },
                            ],
                        }),
                    ],
                    tsNs: 1n,
                }),
            ),
        ).toThrow(/\[MarketOverviewSparklineSchema\]: invalid interval 0/);
    });
});
