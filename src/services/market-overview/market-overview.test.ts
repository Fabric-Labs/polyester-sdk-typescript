import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/marketoverview/v1/marketoverview_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { PolyesterError, ServiceUnavailableError, ValidationError } from "../../shared/errors.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { MarketOverviewService } from "./market-overview.js";

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

function market(overrides: Record<string, unknown> = {}) {
    return {
        symbolId: 101,
        lastPriceTicks: 1_234_567n,
        lastTradeTsNs: 1_700_000_000_000_000_000n,
        change24hBps: 123,
        high24hTicks: 2_000_000n,
        low24hTicks: 1_000_000n,
        volume24hBaseScaled: 123_456_789n,
        volume24hQuoteScaled: 987_654_321n,
        listedTsNs: 1_600_000_000_000_000_000n,
        bestBidTicks: 1_200_000n,
        bestBidQtyScaled: 10_000_000n,
        bestAskTicks: 1_300_000n,
        bestAskQtyScaled: 20_000_000n,
        indexPriceTicks: 1_250_000n,
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
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

describe("MarketOverviewService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns conversion metadata and exact directional rates without loading catalogs", async () => {
        const transport = unaryTransport((call) =>
            call.method.localName === "getCurrencyConversionConfig"
                ? create(Proto.GetCurrencyConversionConfigResponseSchema, {
                      fiat: [
                          {
                              code: "JPY",
                              defaultEnglishName: "Japanese Yen",
                              symbol: "¥",
                              fractionDigits: 0,
                          },
                      ],
                      stablecoins: [
                          {
                              code: "USDT",
                              defaultEnglishName: "Tether",
                              symbol: "USDT",
                              fractionDigits: 2,
                          },
                      ],
                  })
                : create(Proto.GetCurrencyConversionRatesResponseSchema, {
                      fiat: {
                          rates: [{ code: "JPY", unitsPerUsdE8: 9_007_199_254_740_993n }],
                          sourceTsSec: 10n,
                          stale: true,
                      },
                      stablecoins: [
                          {
                              code: "USDT",
                              usdPerUnitE8: 99_999_999n,
                              sourceTsSec: 20n,
                              stale: false,
                          },
                      ],
                      snapshotTsSec: 21n,
                  }),
        );
        const scales = testScales();
        vi.spyOn(scales, "ready").mockRejectedValue(new Error("catalog unavailable"));
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            scales,
        );
        const signal = new AbortController().signal;
        expect((await service.getCurrencyConversionConfig({ signal })).fiat[0]).toEqual({
            code: "JPY",
            defaultEnglishName: "Japanese Yen",
            symbol: "¥",
            fractionDigits: 0,
        });
        expect(transport.lastCall()).toMatchObject({ message: {}, signal });
        expect(await service.getCurrencyConversionRates({ signal })).toEqual({
            fiat: {
                rates: [{ code: "JPY", unitsPerUsd: "90071992.54740993" }],
                sourceTsMs: 10000,
                stale: true,
            },
            stablecoins: [
                { code: "USDT", usdPerUnit: "0.99999999", sourceTsMs: 20000, stale: false },
            ],
            snapshotTsMs: 21000,
        });
        expect(transport.lastCall()).toMatchObject({ message: {}, signal });
        expect(scales.ready).not.toHaveBeenCalled();
    });

    it("preserves missing observations and recovers after an unavailable conversion request", async () => {
        const failure = new ServiceUnavailableError("unavailable");
        const transport = unaryTransport((_call, index) => {
            if (index === 0) throw failure;
            return create(Proto.GetCurrencyConversionRatesResponseSchema, { snapshotTsSec: 0n });
        });
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );
        await expect(service.getCurrencyConversionRates()).rejects.toBe(failure);
        await expect(service.getCurrencyConversionRates()).resolves.toEqual({
            fiat: undefined,
            stablecoins: [],
            snapshotTsMs: 0,
        });
    });

    it("rejects conversion timestamps that cannot be represented exactly in milliseconds", async () => {
        const transport = unaryTransport(
            create(Proto.GetCurrencyConversionRatesResponseSchema, {
                snapshotTsSec: 9_007_199_254_741n,
            }),
        );
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );
        await expect(service.getCurrencyConversionRates()).rejects.toBeInstanceOf(ValidationError);
    });

    it("keeps absent and zero volumes distinct in snapshots and live updates", async () => {
        const transport = unaryTransport({
            markets: [create(Proto.MarketOverviewSchema, { symbolId: 101 })],
            nextPageToken: "",
        });
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );
        const stop = service.subscribe({ onEvent });
        realtime.params?.onConnected?.();
        await flushMicrotasks();
        expect(onEvent.mock.lastCall?.[0][0]).toMatchObject({
            volume24hBase: undefined,
            volume24hQuote: undefined,
            volume24hUsd: undefined,
        });
        realtime.params?.onPublication(
            create(Proto.MarketOverviewBatchSchema, {
                markets: [
                    create(Proto.MarketOverviewSchema, {
                        symbolId: 101,
                        volume24hBaseScaled: 0n,
                        volume24hQuoteScaled: 0n,
                        volume24hUsdScaled: 9_007_199_254_740_993n,
                    }),
                ],
            }),
        );
        expect(onEvent.mock.lastCall?.[0][0]).toMatchObject({
            volume24hBase: "0",
            volume24hQuote: "0",
            volume24hUsd: "9007199254.740993",
        });
        stop();
    });

    it("returns exact USD history without catalog lookup and forwards request options", async () => {
        const values = Array.from({ length: 97 }, (_, i) =>
            i === 0 ? 0n : 9_007_199_254_740_993n,
        );
        const transport = unaryTransport(
            create(Proto.GetSpotVolumeHistoryResponseSchema, {
                bucket: "15m",
                startTsSec: 1_700_000_000,
                endTsSec: 1_700_086_400,
                points: 97,
                pairs: [{ symbolId: 999, volumeUsdScaled: values }],
                totalVolumeUsdScaled: values,
            }),
        );
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );
        const controller = new AbortController();
        const result = await service.getSpotVolumeHistory(
            { symbolIds: [999, 999] },
            { signal: controller.signal },
        );
        expect(transport.lastCall()).toMatchObject({
            method: { localName: "getSpotVolumeHistory" },
            message: { symbolId: [999] },
            signal: controller.signal,
        });
        expect(result).toMatchObject({
            bucket: "15m",
            startTsSec: 1_700_000_000,
            endTsSec: 1_700_086_400,
            points: 97,
        });
        expect(result.pairs[0]?.volumeUsd).toEqual(["0", ...Array(96).fill("9007199254.740993")]);
        expect(result.totalVolumeUsd).toEqual(result.pairs[0]?.volumeUsd);
        await service.getSpotVolumeHistory();
        expect(transport.lastCall()?.message).toEqual({ symbolId: [] });
    });

    it("rejects invalid history filters before transport and propagates unavailable failures", async () => {
        const failure = new Error("valuation unavailable");
        const transport = unaryTransport(() => {
            throw failure;
        });
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );
        for (const symbolIds of [
            [0],
            [-1],
            [1.5],
            [4_294_967_296],
            Array.from({ length: 2001 }, (_, i) => i + 1),
        ]) {
            await expect(service.getSpotVolumeHistory({ symbolIds })).rejects.toBeInstanceOf(
                ValidationError,
            );
        }
        expect(transport.unary).not.toHaveBeenCalled();
        await expect(
            service.getSpotVolumeHistory({
                symbolIds: Array.from({ length: 2000 }, (_, i) => i + 1),
            }),
        ).rejects.toThrow("valuation unavailable");
        expect(transport.unary).toHaveBeenCalledTimes(1);
    });

    it("reports invalid inputs through the SDK error hierarchy", async () => {
        const transport = unaryTransport({});
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        const error = await service.list({ limit: -1 }).catch((reason: unknown) => reason);

        expect(error).toBeInstanceOf(ValidationError);
        expect(error).toBeInstanceOf(PolyesterError);
        expect(error).toMatchObject({
            code: "VALIDATION_FAILED",
            retryable: false,
            cause: { name: "ValiError" },
        });
        expect(transport.unary).not.toHaveBeenCalled();
    });

    it("normalizes list inputs to the proto request and parses market rows into decimals", async () => {
        const controller = new AbortController();
        const transport = unaryTransport({ markets: [market()], nextPageToken: "next-page" });
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        const result = await service.list(
            {
                symbolIds: [101],
                limit: 2,
                pageToken: " cursor-1 ",
                orderBy: "last_price",
                sort: "asc",
                includeSparklines: false,
                sparklineIntervals: ["1h", "1w"],
            },
            { signal: controller.signal },
        );

        expect(transport.lastCall()?.message).toEqual({
            symbolId: [101],
            limit: 2,
            pageToken: "cursor-1",
            orderBy: Proto.MarketOrderBy.ORDER_BY_LAST_PRICE,
            sort: Proto.SortDirection.SORT_ASC,
            includeSparklines: false,
            sparklineIntervals: [
                Proto.SparklineInterval.SPARKLINE_1H,
                Proto.SparklineInterval.SPARKLINE_1W,
            ],
        });
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(result).toEqual({
            markets: [
                {
                    symbolId: 101,
                    lastPrice: "1.234567",
                    lastTradeTsMs: 1_700_000_000_000,
                    change24hBps: 123,
                    high24h: "2",
                    low24h: "1",
                    volume24hBase: "1.23456789",
                    volume24hQuote: "987.654321",
                    listedTsMs: 1_600_000_000_000,
                    bestBid: "1.2",
                    bestBidQty: "0.1",
                    bestAsk: "1.3",
                    bestAskQty: "0.2",
                    indexPrice: "1.25",
                    sparklines: [],
                },
            ],
            nextPageToken: "next-page",
        });
    });

    it("returns an empty list for empty market overview responses", async () => {
        const transport = unaryTransport({ markets: [], nextPageToken: "" });
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.list()).resolves.toEqual({ markets: [], nextPageToken: "" });
        expect(transport.lastCall()?.message).toMatchObject({
            symbolId: [],
            limit: 500,
            pageToken: "",
            includeSparklines: true,
            sparklineIntervals: [Proto.SparklineInterval.SPARKLINE_24H],
        });
    });

    it("skips market rows for unknown symbol ids instead of failing the batch", async () => {
        const transport = unaryTransport({
            markets: [market(), market({ symbolId: 999 })],
            nextPageToken: "",
        });
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        const result = await service.list();

        expect(result.markets).toEqual([expect.objectContaining({ symbolId: 101 })]);
    });

    it("skips live publications for unknown symbol ids and keeps streaming later updates", async () => {
        const transport = unaryTransport({
            markets: [market(), market({ symbolId: 999 })],
            nextPageToken: "",
        });
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );

        service.subscribe({ onEvent, onError });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledTimes(1);
        expect(onEvent.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ symbolId: 101 })]);

        realtime.params?.onPublication(
            create(Proto.MarketOverviewBatchSchema, {
                markets: [market({ symbolId: 999, lastPriceTicks: 5n })],
                tsNs: 1n,
            }),
        );
        realtime.params?.onPublication(
            create(Proto.MarketOverviewBatchSchema, {
                markets: [market({ lastPriceTicks: 2_000_000n })],
                tsNs: 2n,
            }),
        );
        await flushMicrotasks();

        expect(onError).not.toHaveBeenCalled();
        expect(onEvent).toHaveBeenCalledTimes(3);
        expect(onEvent.mock.calls[2]?.[0]).toEqual([
            expect.objectContaining({ symbolId: 101, lastPrice: "2" }),
        ]);
    });

    it("forwards subscribe symbolIds to the snapshot request", async () => {
        const transport = unaryTransport({ markets: [market()], nextPageToken: "" });
        const realtime = realtimeClientStub();
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );

        service.subscribe({ symbolIds: [101], onEvent: vi.fn() });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(transport.lastCall()?.message).toMatchObject({ symbolId: [101] });
    });

    it("rejects market rows with unmapped backend sparkline enums", async () => {
        const transport = unaryTransport({
            markets: [
                market({
                    sparklines: [
                        {
                            interval: 999 as Proto.SparklineInterval,
                            closeTicks: [1n],
                        },
                    ],
                }),
            ],
            nextPageToken: "",
        });
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.list()).rejects.toThrow(/received 999/);
    });

    it("buffers subscription publications until the initial snapshot resolves", async () => {
        const snapshot = deferred<Record<string, unknown>>();
        const transport = unaryTransport(() => snapshot.promise);
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );

        service.subscribe({
            includeSparklines: false,
            sparklineIntervals: ["1h"],
            onEvent,
            onOpen,
        });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(realtime.params?.channel).toBe("public:spot:market_overview:updates:proto");
        expect(realtime.params?.schema).toBe(Proto.MarketOverviewBatchSchema);
        expect(transport.lastCall()?.message).toMatchObject({
            includeSparklines: false,
            sparklineIntervals: [Proto.SparklineInterval.SPARKLINE_1H],
        });

        realtime.params?.onPublication(
            create(Proto.MarketOverviewBatchSchema, {
                markets: [market({ lastPriceTicks: 2_000_000n })],
                tsNs: 1n,
            }),
        );

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onEvent).not.toHaveBeenCalled();

        snapshot.resolve({ markets: [market({ lastPriceTicks: 1_000_000n })], nextPageToken: "" });
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledTimes(1);
        expect(onEvent.mock.calls[0]?.[0]).toEqual([
            expect.objectContaining({ symbolId: 101, lastPrice: "2", indexPrice: "1.25" }),
        ]);
    });

    it("refetches snapshots on each subscribed epoch until unsubscribed", async () => {
        const transport = unaryTransport({ markets: [market()], nextPageToken: "next-page" });
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onClose = vi.fn();
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );

        const unsubscribe = service.subscribe({ onEvent, onClose });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(transport.unary).toHaveBeenCalledTimes(1);

        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onClose).not.toHaveBeenCalled();
        expect(transport.unary).toHaveBeenCalledTimes(2);

        unsubscribe();
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onClose).not.toHaveBeenCalled();
        expect(transport.unary).toHaveBeenCalledTimes(2);
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("reports snapshot failures through the subscription error callback", async () => {
        const transport = unaryTransport(() => {
            throw new Error("snapshot unavailable");
        });
        const realtime = realtimeClientStub();
        const onError = vi.fn();
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );

        service.subscribe({ onEvent: vi.fn(), onError });
        realtime.params?.onConnected?.();
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
        const transport = unaryTransport((_call, index) => {
            if (index === 0) return { markets: [market()], nextPageToken: "" };
            throw new Error("reconnect snapshot unavailable");
        });
        const realtime = realtimeClientStub();
        const onError = vi.fn();
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );

        service.subscribe({ onEvent: vi.fn(), onError });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onError).not.toHaveBeenCalled();

        realtime.params?.onConnected?.();
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

    it("routes malformed market overview publications to the error callback after snapshot readiness", async () => {
        const transport = unaryTransport({ markets: [market()], nextPageToken: "next-page" });
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new MarketOverviewService(
            { publicApi: transport.transport },
            realtime.realtime,
            testScales(),
        );

        service.subscribe({ onEvent, onError });
        realtime.params?.onConnected?.();
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledTimes(1);

        realtime.params?.onPublication(
            create(Proto.MarketOverviewBatchSchema, {
                markets: [
                    market({
                        sparklines: [
                            {
                                interval: 999 as Proto.SparklineInterval,
                                closeTicks: [1n],
                            },
                        ],
                    }),
                ],
                tsNs: 1n,
            }),
        );
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "public:spot:market_overview:updates:proto",
            type: "publication_handler",
        });
        expect(onError.mock.calls[0]?.[0].error.message).toMatch(/received 999/);
    });
});
