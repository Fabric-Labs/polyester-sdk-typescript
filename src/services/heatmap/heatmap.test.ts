import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    setEnrichedPairCatalog,
    type EnrichedPairConfig,
} from "../../catalogs/market-data-catalog.js";
import * as Proto from "../../gen/marketdata/v1/heatmap_pb.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { HeatmapService } from "./heatmap.js";

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

function seedPairCatalog(): void {
    setEnrichedPairCatalog([btcUsdtPair]);
}

type HeatmapDeltaLevelsInit = {
    priceTicks: bigint[];
    qtyScaled: bigint[];
};

type HeatmapLiveBucketInit = {
    symbolId: number;
    interval: Proto.HeatmapInterval;
    tsSec: bigint;
    isFinal: boolean;
    bids: HeatmapDeltaLevelsInit;
    asks: HeatmapDeltaLevelsInit;
    updatesInBucket: number;
    bookSeqStart: bigint;
    bookSeqEnd: bigint;
    quantityMode: Proto.HeatmapQuantityMode;
    effectiveBinTicks: bigint;
};

function liveBucket(overrides: Partial<HeatmapLiveBucketInit> = {}): HeatmapLiveBucketInit {
    return {
        symbolId: 101,
        interval: Proto.HeatmapInterval.INTERVAL_1S,
        tsSec: 120n,
        isFinal: false,
        bids: { priceTicks: [100n], qtyScaled: [2n] },
        asks: { priceTicks: [101n], qtyScaled: [3n] },
        updatesInBucket: 4,
        bookSeqStart: 10n,
        bookSeqEnd: 11n,
        quantityMode: Proto.HeatmapQuantityMode.CLOSE,
        effectiveBinTicks: 1n,
        ...overrides,
    };
}

function heatmapResponse(overrides: Record<string, unknown> = {}) {
    return {
        symbolId: 101,
        interval: Proto.HeatmapInterval.INTERVAL_1S,
        depth: Proto.HeatmapDepth.DEPTH_50,
        chain: {
            baseKeyframe: {
                tsSec: 100n,
                bestBidTick: 100n,
                bestAskTick: 101n,
                midTick: 100n,
                bids: { priceTicks: [100n], qtyScaled: [2n] },
                asks: { priceTicks: [101n], qtyScaled: [3n] },
                bookSeq: 10n,
            },
            deltas: [
                {
                    tsSec: 110n,
                    bids: { priceTicks: [99n], qtyScaled: [1n] },
                    asks: { priceTicks: [102n], qtyScaled: [4n] },
                    updatesInBucket: 2,
                    bookSeqStart: 11n,
                    bookSeqEnd: 12n,
                },
            ],
        },
        lastPersistedTsSec: 110n,
        liveFromBookSeqEnd: 12n,
        hasLiveAnchor: true,
        hasMore: false,
        nextTsSec: 0n,
        serverTimeSec: 130n,
        quantityMode: Proto.HeatmapQuantityMode.CLOSE,
        liveBucket: liveBucket(),
        ...overrides,
    };
}

describe("HeatmapService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setEnrichedPairCatalog([]);
    });

    it("normalizes heatmap requests for cursor and time-range modes", async () => {
        seedPairCatalog();
        const cases = [
            {
                name: "cursor defaults",
                input: { symbol: "BTC-USDT", cursorTsSec: 200 },
                response: heatmapResponse(),
                expected: {
                    symbolId: 101,
                    interval: Proto.HeatmapInterval.INTERVAL_1S,
                    depth: Proto.HeatmapDepth.DEPTH_50,
                    quantityMode: Proto.HeatmapQuantityMode.CLOSE,
                    mode: { case: "cursor", value: { fromTsSec: 200n } },
                },
            },
            {
                name: "time range explicit values",
                input: {
                    symbolId: 101,
                    interval: "1m",
                    depth: 100,
                    quantityMode: "peak",
                    limit: 500,
                    startTsSec: 100,
                    endTsSec: 200,
                },
                response: heatmapResponse({
                    interval: Proto.HeatmapInterval.INTERVAL_1M,
                    depth: Proto.HeatmapDepth.DEPTH_100,
                    quantityMode: Proto.HeatmapQuantityMode.PEAK,
                }),
                expected: {
                    symbolId: 101,
                    interval: Proto.HeatmapInterval.INTERVAL_1M,
                    depth: Proto.HeatmapDepth.DEPTH_100,
                    quantityMode: Proto.HeatmapQuantityMode.PEAK,
                    limit: 500,
                    mode: {
                        case: "timeRange",
                        value: {
                            startTime: { seconds: 100n, nanos: 0 },
                            endTime: { seconds: 200n, nanos: 0 },
                        },
                    },
                },
            },
        ] as const;

        for (const testCase of cases) {
            const controller = new AbortController();
            const transport = unaryTransport(testCase.response);
            const service = new HeatmapService(transport.transport, realtimeClientStub().realtime);

            const response = await service.getOrderbookHeatmap(testCase.input, {
                signal: controller.signal,
            });

            expect(transport.lastCall()?.message, testCase.name).toMatchObject(testCase.expected);
            expect(transport.lastCall()?.signal, testCase.name).toBe(controller.signal);
            expect(response).toMatchObject({
                symbolId: 101,
                interval:
                    testCase.expected.interval === Proto.HeatmapInterval.INTERVAL_1M ? "1m" : "1s",
                depth: testCase.expected.depth === Proto.HeatmapDepth.DEPTH_100 ? 100 : 50,
                lastPersistedTsSec: 110,
                liveFromBookSeqEnd: "12",
                quantityMode:
                    testCase.expected.quantityMode === Proto.HeatmapQuantityMode.PEAK
                        ? "peak"
                        : "close",
                chain: {
                    baseKeyframe: {
                        tsSec: 100,
                        bestBidTick: "100",
                        bids: { priceTicks: ["100"], qtyScaled: ["2"] },
                        bookSeq: "10",
                    },
                    deltas: [
                        {
                            tsSec: 110,
                            bookSeqStart: "11",
                            bookSeqEnd: "12",
                        },
                    ],
                },
            });
        }
    });

    it("rejects heatmap responses with unmapped backend enums", async () => {
        const transport = unaryTransport(
            heatmapResponse({ interval: Proto.HeatmapInterval.INTERVAL_UNSPECIFIED }),
        );
        const service = new HeatmapService(transport.transport, realtimeClientStub().realtime);

        await expect(
            service.getOrderbookHeatmap({ symbolId: 101, cursorTsSec: 200 }),
        ).rejects.toThrow(/\[OrderbookHeatmapResponseSchema\]: invalid interval 0/);
    });

    it("wires live subscriptions and parses live buckets", () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new HeatmapService(unaryTransport({}).transport, realtime.realtime);

        const unsubscribe = service.subscribeLive({
            symbolId: 101,
            interval: "1m",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("public:spot:market:heatmap:1m:101:proto");
        expect(realtime.params?.schema).toBe(Proto.HeatmapLiveBucketSchema);

        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        const error = { channel: "c", type: "decode", error: { code: 1, message: "bad" } };
        realtime.params?.onError?.(error);
        realtime.params?.onPublication(
            create(
                Proto.HeatmapLiveBucketSchema,
                liveBucket({ interval: Proto.HeatmapInterval.INTERVAL_1M }),
            ),
        );

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                symbolId: 101,
                interval: "1m",
                tsSec: 120,
                bookSeqStart: "10",
                bookSeqEnd: "11",
                quantityMode: "close",
                effectiveBinTicks: "1",
            }),
        );

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("validates live subscription params before connecting realtime", () => {
        const realtime = realtimeClientStub();
        const service = new HeatmapService(unaryTransport({}).transport, realtime.realtime);
        const cases = [
            () => service.subscribeLive({ symbolId: 0, interval: "1m", onEvent: vi.fn() }),
            () =>
                service.subscribeLive({
                    symbolId: 101,
                    interval: "15m" as never,
                    onEvent: vi.fn(),
                }),
        ];

        for (const subscribe of cases) {
            expect(subscribe).toThrow();
        }
        expect(realtime.connectProtoChannel).not.toHaveBeenCalled();
    });

    it("throws on live publications with unmapped backend enums", () => {
        const realtime = realtimeClientStub();
        const service = new HeatmapService(unaryTransport({}).transport, realtime.realtime);

        service.subscribeLive({ symbolId: 101, interval: "1s", onEvent: vi.fn() });

        expect(() =>
            realtime.params?.onPublication(
                create(
                    Proto.HeatmapLiveBucketSchema,
                    liveBucket({ quantityMode: Proto.HeatmapQuantityMode.QTY_MODE_UNSPECIFIED }),
                ),
            ),
        ).toThrow(/\[OrderbookHeatmapResponseSchema\]: invalid quantity mode 0/);
    });
});
