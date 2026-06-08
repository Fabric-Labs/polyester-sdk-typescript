import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    setAssetCatalog,
    setEnrichedPairCatalog,
    type EnrichedPairConfig,
} from "../../catalogs/market-data-catalog.js";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { CandlesService } from "./candles.js";

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
    listingAt: null,
    delistingAt: null,
    status: "enabled",
};

const candlePoint = {
    tsSec: 100n,
    open: 1_234_000n,
    high: 1_235_000n,
    low: 1_233_000n,
    close: 1_234_567n,
    volume: 123_456_789n,
    isClosed: true,
};

function seedPairCatalog(): void {
    setAssetCatalog([btc, usdt]);
    setEnrichedPairCatalog([btcUsdtPair]);
}

describe("CandlesService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setAssetCatalog([]);
        setEnrichedPairCatalog([]);
    });

    it("normalizes list inputs to the candle proto request and parses rows", async () => {
        seedPairCatalog();
        const controller = new AbortController();
        const transport = unaryTransport({
            symbolId: 101,
            timeframe: Proto.Timeframe.MIN_5,
            candles: [candlePoint],
        });
        const service = new CandlesService(transport.transport, realtimeClientStub().realtime);

        const candles = await service.list(
            {
                symbol: "BTC-USDT",
                timeframe: "5m",
                limit: "25",
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
                open: 1.234,
                high: 1.235,
                low: 1.233,
                close: 1.234567,
                volume: 1.23456789,
                isClosed: true,
            },
        ]);
    });

    it("returns an empty list when the candle response omits repeated rows", async () => {
        seedPairCatalog();
        const transport = unaryTransport({
            symbolId: 101,
            timeframe: Proto.Timeframe.MIN_1,
        });
        const service = new CandlesService(transport.transport, realtimeClientStub().realtime);

        await expect(service.list({ symbolId: 101, timeframe: "1m" })).resolves.toEqual([]);
    });

    it("parses decimal columnar responses and preserves optional reference series", async () => {
        seedPairCatalog();
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
        const service = new CandlesService(transport.transport, realtimeClientStub().realtime);

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
            open: [1],
            high: [1.5],
            low: [0.9],
            close: [1.25],
            volume: [1],
            reference: {
                time: [90],
                open: [2],
                high: [2.5],
                low: [1.9],
                close: [2.25],
                volume: [2],
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
        const service = new CandlesService(transport.transport, realtimeClientStub().realtime);

        const columnar = await service.listColumnarInts({ symbolId: 101, timeframe: "1s" });

        expect(columnar).toEqual({
            symbolId: 101,
            timeframe: "1s",
            tsSec: [100n],
            open: [1n],
            high: [2n],
            low: [3n],
            close: [4n],
            volume: [5n],
            reference: null,
        });
    });

    it("rejects candle responses with unmapped backend enums", async () => {
        const transport = unaryTransport({
            symbolId: 101,
            timeframe: Proto.Timeframe.TIMEFRAME_UNSPECIFIED,
            candles: [candlePoint],
        });
        const service = new CandlesService(transport.transport, realtimeClientStub().realtime);

        await expect(service.list({ symbolId: 101, timeframe: "1m" })).rejects.toThrow(
            /\[CandlesService.CandleRowSchema\]: invalid timeframe 0/,
        );
    });

    it("wires row candle subscriptions and parses point publications", () => {
        seedPairCatalog();
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new CandlesService(unaryTransport({}).transport, realtime.realtime);

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

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                symbolId: 101,
                timeframe: "1m",
                close: 1.234567,
                volume: 1.23456789,
            }),
        );

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("wires integer candle subscriptions and preserves integer payloads", () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const service = new CandlesService(unaryTransport({}).transport, realtime.realtime);

        service.subscribeInts({ symbolId: 101, timeframe: "1s", onEvent });
        realtime.params?.onPublication(create(Proto.CandlePointSchema, candlePoint));

        expect(realtime.params?.channel).toBe("public:spot:market:candles:1s:101:proto");
        expect(onEvent).toHaveBeenCalledWith({
            symbolId: 101,
            timeframe: "1s",
            ...candlePoint,
        });
    });

    it("validates subscription params before connecting realtime", () => {
        const realtime = realtimeClientStub();
        const service = new CandlesService(unaryTransport({}).transport, realtime.realtime);
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

    it("throws on malformed candle publications", () => {
        const realtime = realtimeClientStub();
        const service = new CandlesService(unaryTransport({}).transport, realtime.realtime);

        service.subscribe({ symbolId: 101, timeframe: "1m", onEvent: vi.fn() });

        expect(() =>
            realtime.params?.onPublication({
                ...candlePoint,
                open: "bad",
            } as never),
        ).toThrow();
    });
});
