import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import { createCatalogSdkScales, type SdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { MarketDataService } from "./market-data.js";

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
    name: "Tether",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};

const btcUsdt: EnrichedPairConfig = {
    symbolId: 101,
    symbol: "BTC-USDT",
    baseAsset: btc,
    quoteAsset: usdt,
    tickSize: "0.000001",
    stepSize: "0.00000001",
    minNotionalQuote: "1",
    minQtyBase: "0.00000001",
    allowBuyFeeFromBase: false,
    defaultMarketSlippagePctBuy: 0,
    defaultMarketSlippagePctSell: 0,
    maxClientRefDriftPct: 0,
    listingAt: null,
    delistingAt: null,
    status: "enabled",
};

function testScales() {
    const catalog = createTestCatalog({ pairs: [btcUsdt] });
    return createCatalogSdkScales(() => catalog);
}

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const marketTrade = {
    symbolId: 101,
    matchId: 22n,
    isBuy: false,
    priceTicks: 1_234_567n,
    qtyScaled: 123_456_789n,
    tsNs: 1_700_000_000_000_000_000n,
};

describe("MarketDataService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes public trade filters to the proto request and parses trades to decimal strings", async () => {
        const controller = new AbortController();
        const transport = unaryTransport({ trades: [marketTrade], nextPageToken: "next" });
        const service = new MarketDataService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        const result = await service.listTrades(
            {
                symbolId: 101,
                side: "buy",
                startTsNs: "1700000000123456789",
                endTsNs: "1700000001123456789",
                limit: 25,
                pageToken: " cursor-1 ",
            },
            { signal: controller.signal },
        );

        expect(transport.lastCall()?.message).toEqual({
            symbolId: 101,
            side: Proto.SideFilter.BUY,
            startTime: { seconds: 1_700_000_000n, nanos: 123_456_789 },
            endTime: { seconds: 1_700_000_001n, nanos: 123_456_789 },
            limit: 25,
            pageToken: "cursor-1",
        });
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(result).toEqual({
            trades: [
                expect.objectContaining({
                    symbolId: 101,
                    matchId: "22",
                    sideLabel: "sell",
                    qty: "1.23456789",
                    price: "1.234567",
                    tsMs: 1_700_000_000_000,
                }),
            ],
            nextPageToken: "next",
        });
    });

    it("returns an empty public trade list for empty backend rows", async () => {
        const transport = unaryTransport({ trades: [], nextPageToken: "" });
        const service = new MarketDataService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.listTrades({ symbolId: 101 })).resolves.toEqual({
            trades: [],
            nextPageToken: "",
        });
    });

    it("rejects public trades for symbols unknown to the catalog", async () => {
        const transport = unaryTransport({
            trades: [{ ...marketTrade, symbolId: 999 }],
            nextPageToken: "",
        });
        const service = new MarketDataService(
            transport.transport,
            realtimeClientStub().realtime,
            testScales(),
        );

        await expect(service.listTrades({ symbolId: 999 })).rejects.toThrow(
            /symbolId not found: 999/,
        );
    });

    it("parses spot config responses without waiting on catalog readiness", async () => {
        const controller = new AbortController();
        const transport = unaryTransport({
            assets: [
                {
                    asset: "BTC",
                    ledgerId: 1,
                    name: "Bitcoin",
                    quantityDisplayDecimals: 8,
                    quantityScale: 8,
                },
            ],
            pairs: [
                {
                    symbolId: 101,
                    symbol: "BTC-USDT",
                    baseAsset: "BTC",
                    quoteAsset: "USDT",
                    tickSize: "0.000001",
                    stepSize: "0.00000001",
                    minNotionalQuote: "1",
                    minQtyBase: "0.00000001",
                    allowBuyFeeFromBase: false,
                    baseQuantityScale: 8,
                    quoteQuantityScale: 6,
                    defaultMarketSlippageBpsBuy: 25,
                    defaultMarketSlippageBpsSell: 50,
                    maxClientRefDriftBps: 10,
                    marketdata: { orderbookPriceBuckets: [0.01, 0.1] },
                    listingAt: { seconds: 1_700_000_000n, nanos: 0 },
                    status: Proto.PairStatus.ENABLED,
                },
            ],
            tsSec: 123n,
        });
        // getSpotConfig is the catalog's own data source: it must not await
        // scale readiness or read any scale, or the initial refresh deadlocks.
        const neverReadyScales: SdkScales = {
            ready: () => new Promise<never>(() => {}),
            price: () => {
                throw new Error("getSpotConfig must not use scales");
            },
            baseQty: () => {
                throw new Error("getSpotConfig must not use scales");
            },
            quoteAmount: () => {
                throw new Error("getSpotConfig must not use scales");
            },
            ledgerAmount: () => {
                throw new Error("getSpotConfig must not use scales");
            },
            zippedAssetAmount: () => {
                throw new Error("getSpotConfig must not use scales");
            },
        };
        const service = new MarketDataService(
            transport.transport,
            realtimeClientStub().realtime,
            neverReadyScales,
        );

        const config = await service.getSpotConfig({ signal: controller.signal });

        expect(transport.lastCall()?.message).toEqual({});
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(config).toMatchObject({
            assets: [
                {
                    symbol: "BTC",
                    ledgerId: 1,
                    name: "Bitcoin",
                    quantityDisplayDecimals: 8,
                    quantityScale: 8,
                },
            ],
            pairs: [
                {
                    symbolId: 101,
                    defaultMarketSlippagePctBuy: 0.25,
                    defaultMarketSlippagePctSell: 0.5,
                    maxClientRefDriftPct: 0.1,
                    marketdata: { orderbookPriceBuckets: [0.01, 0.1] },
                    listingAt: 1_700_000_000_000,
                },
            ],
            tsSec: 123_000,
        });
    });

    it("wires public trade subscriptions and parses publications", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new MarketDataService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );

        const unsubscribe = service.subscribeTrades({
            symbolId: 101,
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("public:spot:market:trades:101:proto");
        expect(realtime.params?.schema).toBe(Proto.MarketTradeSchema);

        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        const error = { channel: "c", type: "decode", error: { code: 1, message: "bad" } };
        realtime.params?.onError?.(error);
        realtime.params?.onPublication(create(Proto.MarketTradeSchema, marketTrade));
        await flushAsync();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                symbolId: 101,
                sideLabel: "sell",
                price: "1.234567",
                qty: "1.23456789",
            }),
        );

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("uses the caller-provided subscription symbol id", () => {
        const realtime = realtimeClientStub();
        const service = new MarketDataService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );

        service.subscribeTrades({
            symbolId: 999,
            onEvent: vi.fn(),
        });

        expect(realtime.params?.channel).toBe("public:spot:market:trades:999:proto");
    });

    it("routes malformed public trade publications to the subscription onError", async () => {
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onError = vi.fn();
        const service = new MarketDataService(
            unaryTransport({}).transport,
            realtime.realtime,
            testScales(),
        );

        service.subscribeTrades({ symbolId: 101, onEvent, onError });

        realtime.params?.onPublication({
            ...marketTrade,
            qtyScaled: "bad",
        } as never);
        await flushAsync();

        expect(onEvent).not.toHaveBeenCalled();
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "public:spot:market:trades:101:proto",
            type: "publication_handler",
        });
        expect(onError.mock.calls[0]?.[0].error.message).toMatch(
            /Invalid type: Expected bigint but received "bad"/,
        );
    });
});
