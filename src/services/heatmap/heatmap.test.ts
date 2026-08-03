import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/marketdata/v1/heatmap_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { HeatmapService } from "./heatmap.js";

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
                bestBidTicks: 100n,
                bestAskTicks: 101n,
                midTicks: 100n,
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
        nextPageToken: "",
        serverTimeSec: 130n,
        quantityMode: Proto.HeatmapQuantityMode.CLOSE,
        liveBucket: liveBucket(),
        ...overrides,
    };
}

describe("HeatmapService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes heatmap requests for page-token and time-range modes", async () => {
        const cases = [
            {
                name: "page token pagination",
                input: { symbolId: 101, startTsSec: 100, pageToken: "cursor-1" },
                response: heatmapResponse(),
                expected: {
                    symbolId: 101,
                    interval: Proto.HeatmapInterval.INTERVAL_1S,
                    depth: Proto.HeatmapDepth.DEPTH_50,
                    quantityMode: Proto.HeatmapQuantityMode.CLOSE,
                    pageToken: "cursor-1",
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
                    pageToken: "",
                    timeRange: {
                        startTime: { seconds: 100n, nanos: 0 },
                        endTime: { seconds: 200n, nanos: 0 },
                    },
                },
            },
        ] as const;

        for (const testCase of cases) {
            const controller = new AbortController();
            const transport = unaryTransport(testCase.response);
            const service = new HeatmapService(
                transport.transport,
                realtimeClientStub().realtime,
                testScales(),
            );

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
                        bestBid: "0.0001",
                        bestAsk: "0.000101",
                        mid: "0.0001",
                        bids: { price: ["0.0001"], qty: ["0.00000002"] },
                        asks: { price: ["0.000101"], qty: ["0.00000003"] },
                        bookSeq: "10",
                    },
                    deltas: [
                        {
                            tsSec: 110,
                            bids: { price: ["0.000099"], qty: ["0.00000001"] },
                            asks: { price: ["0.000102"], qty: ["0.00000004"] },
                            bookSeqStart: "11",
                            bookSeqEnd: "12",
                        },
                    ],
                },
                liveBucket: {
                    symbolId: 101,
                    effectiveBinSize: "0.000001",
                },
            });
        }
    });

    it("rejects heatmap responses with unmapped backend enums", async () => {
        const transport = unaryTransport(
            heatmapResponse({ interval: 999 as Proto.HeatmapInterval }),
        );
        const service = new HeatmapService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(
            service.getOrderbookHeatmap({ symbolId: 101, startTsSec: 100 }),
        ).rejects.toThrow(/\[OrderbookHeatmapResponseSchema\]: invalid interval 999/);
    });

    it("wires live subscriptions and parses live buckets into decimals", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new HeatmapService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );

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
        await flushMicrotasks();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                symbolId: 101,
                interval: "1m",
                tsSec: 120,
                bids: { price: ["0.0001"], qty: ["0.00000002"] },
                asks: { price: ["0.000101"], qty: ["0.00000003"] },
                bookSeqStart: "10",
                bookSeqEnd: "11",
                quantityMode: "close",
                effectiveBinSize: "0.000001",
            }),
        );

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("validates live subscription params before connecting realtime", () => {
        const realtime = realtimeClientStub();
        const service = new HeatmapService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );
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

    it("routes live publications with unmapped backend enums to the error callback", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new HeatmapService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );

        service.subscribeLive({ symbolId: 101, interval: "1s", onEvent, onError });

        realtime.params?.onPublication(
            create(
                Proto.HeatmapLiveBucketSchema,
                liveBucket({ quantityMode: 999 as Proto.HeatmapQuantityMode }),
            ),
        );
        await flushMicrotasks();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "public:spot:market:heatmap:1s:101:proto",
            type: "publication_handler",
        });
        expect(onError.mock.calls[0]?.[0].error.message).toMatch(
            /\[OrderbookHeatmapResponseSchema\]: invalid quantity mode 999/,
        );
    });
});
