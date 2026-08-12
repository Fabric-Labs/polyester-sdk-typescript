import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import { CatalogLookupError } from "../../catalogs/types.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { CandlesService } from "./candles.js";

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
    for (let i = 0; i < 3; i++) {
        await Promise.resolve();
    }
}

const candlePoint = {
    tsSec: 100n,
    open: 1_234_000n,
    high: 1_235_000n,
    low: 1_233_000n,
    close: 1_234_567n,
    volume: 123_456_789n,
    isClosed: true,
};

describe("CandlesService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes list inputs to the candle proto request and parses decimal rows", async () => {
        const controller = new AbortController();
        const transport = unaryTransport({
            symbolId: 101,
            timeframe: Proto.Timeframe.MIN_5,
            candles: [candlePoint],
        });
        const service = new CandlesService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        const candles = await service.list(
            {
                symbolId: 101,
                timeframe: "5m",
                limit: 25,
                includeIncomplete: true,
                startTsSec: 100,
                endTsSec: 200,
            },
            { signal: controller.signal },
        );

        expect(transport.lastCall()?.message).toMatchObject({
            symbolId: 101,
            timeframe: Proto.Timeframe.MIN_5,
            limit: 25,
            includeIncomplete: true,
            includeReference: false,
            startTime: { seconds: 100n, nanos: 0 },
            endTime: { seconds: 200n, nanos: 0 },
        });
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(candles).toEqual([
            {
                symbolId: 101,
                timeframe: "5m",
                time: 100,
                open: "1.234",
                high: "1.235",
                low: "1.233",
                close: "1.234567",
                volume: "1.23456789",
                isClosed: true,
            },
        ]);
    });

    it("returns an empty list when the candle response omits repeated rows", async () => {
        const transport = unaryTransport({
            symbolId: 101,
            timeframe: Proto.Timeframe.MIN_1,
        });
        const service = new CandlesService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.list({ symbolId: 101, timeframe: "1m" })).resolves.toEqual([]);
    });

    it("rejects candle responses for unknown symbol ids during parse", async () => {
        const transport = unaryTransport({
            symbolId: 999,
            timeframe: Proto.Timeframe.MIN_1,
            candles: [candlePoint],
        });
        const service = new CandlesService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.list({ symbolId: 999, timeframe: "1m" })).rejects.toThrow(
            CatalogLookupError,
        );
    });

    it("parses decimal columnar responses and preserves optional reference series", async () => {
        const transport = unaryTransport({
            symbolId: 101,
            timeframe: Proto.Timeframe.HOUR_1,
            tsSec: [100n],
            open: [1_000_000n],
            high: [1_500_000n],
            low: [900_000n],
            close: [1_250_000n],
            volume: [100_000_000n],
            referenceTsSec: [90n],
            referenceOpen: [2_000_000n],
            referenceHigh: [2_500_000n],
            referenceLow: [1_900_000n],
            referenceClose: [2_250_000n],
            referenceVolume: [200_000_000n],
        });
        const service = new CandlesService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        const columnar = await service.listColumnar({
            symbolId: 101,
            timeframe: "1h",
            includeReference: true,
        });

        expect(transport.lastCall()?.message).toMatchObject({
            symbolId: 101,
            timeframe: Proto.Timeframe.HOUR_1,
            includeReference: true,
        });
        expect(columnar).toEqual({
            symbolId: 101,
            timeframe: "1h",
            time: [100],
            open: ["1"],
            high: ["1.5"],
            low: ["0.9"],
            close: ["1.25"],
            volume: ["1"],
            nextPageToken: "",
            reference: {
                time: [90],
                open: ["2"],
                high: ["2.5"],
                low: ["1.9"],
                close: ["2.25"],
                volume: ["2"],
            },
        });
    });

    it("parses integer columnar responses and defaults missing reference arrays to null", async () => {
        const transport = unaryTransport({
            symbolId: 101,
            timeframe: Proto.Timeframe.SEC_1,
            tsSec: [100n],
            open: [1n],
            high: [2n],
            low: [3n],
            close: [4n],
            volume: [5n],
        });
        const service = new CandlesService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        const columnar = await service.listColumnarInts({ symbolId: 101, timeframe: "1s" });

        expect(columnar).toEqual({
            symbolId: 101,
            timeframe: "1s",
            tsSec: [100],
            open: ["0.000001"],
            high: ["0.000002"],
            low: ["0.000003"],
            close: ["0.000004"],
            volume: ["0.00000005"],
            nextPageToken: "",
            reference: null,
        });
    });

    it("rejects candle responses with unmapped backend enums", async () => {
        const transport = unaryTransport({
            symbolId: 101,
            timeframe: 999 as Proto.Timeframe,
            candles: [candlePoint],
        });
        const service = new CandlesService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.list({ symbolId: 101, timeframe: "1m" })).rejects.toThrow(
            /received 999/,
        );
    });

    it("wires row candle subscriptions and parses point publications", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new CandlesService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );

        const unsubscribe = service.subscribe({
            symbolId: 101,
            timeframe: "1m",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("public:spot:market:candles:1m:101:proto");
        expect(realtime.params?.schema).toBe(Proto.CandlePointSchema);

        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        const error = { channel: "c", type: "decode", error: { code: 1, message: "bad" } };
        realtime.params?.onError?.(error);
        realtime.params?.onPublication(create(Proto.CandlePointSchema, candlePoint));
        await flushMicrotasks();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                symbolId: 101,
                timeframe: "1m",
                close: "1.234567",
                volume: "1.23456789",
            }),
        );

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("wires integer candle subscriptions and emits decimal payloads", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const service = new CandlesService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );

        service.subscribeInts({ symbolId: 101, timeframe: "1s", onEvent });
        realtime.params?.onPublication(create(Proto.CandlePointSchema, candlePoint));
        await flushMicrotasks();

        expect(realtime.params?.channel).toBe("public:spot:market:candles:1s:101:proto");
        expect(onEvent).toHaveBeenCalledWith({
            symbolId: 101,
            timeframe: "1s",
            time: 100,
            open: "1.234",
            high: "1.235",
            low: "1.233",
            close: "1.234567",
            volume: "1.23456789",
            isClosed: true,
        });
    });

    it("queues publications arriving before scales are ready and flushes them in order", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const service = new CandlesService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );

        service.subscribe({ symbolId: 101, timeframe: "1m", onEvent });
        realtime.params?.onPublication(create(Proto.CandlePointSchema, candlePoint));
        realtime.params?.onPublication(
            create(Proto.CandlePointSchema, { ...candlePoint, close: 1_300_000n }),
        );

        expect(onEvent).not.toHaveBeenCalled();
        await flushMicrotasks();

        expect(onEvent).toHaveBeenCalledTimes(2);
        expect(onEvent.mock.calls[0]?.[0]).toMatchObject({ close: "1.234567" });
        expect(onEvent.mock.calls[1]?.[0]).toMatchObject({ close: "1.3" });
    });

    it("validates subscription params before connecting realtime", () => {
        const realtime = realtimeClientStub();
        const service = new CandlesService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );
        const cases = [
            () => service.subscribe({ symbolId: 0, timeframe: "1m", onEvent: vi.fn() }),
            () =>
                service.subscribeInts({
                    symbolId: 101,
                    timeframe: "2m" as never,
                    onEvent: vi.fn(),
                }),
        ];

        for (const subscribe of cases) {
            expect(subscribe).toThrow();
        }
        expect(realtime.connectProtoChannel).not.toHaveBeenCalled();
    });

    it("routes malformed candle publications to the subscription error callback", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new CandlesService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );

        service.subscribe({ symbolId: 101, timeframe: "1m", onEvent, onError });

        realtime.params?.onPublication({
            ...candlePoint,
            open: "bad",
        } as never);
        await flushMicrotasks();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "public:spot:market:candles:1m:101:proto",
            type: "publication_handler",
        });
        expect(onError.mock.calls[0]?.[0].error.message).toMatch(
            /Invalid type: Expected bigint but received "bad"/,
        );
    });
});
