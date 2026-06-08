import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    setAssetCatalog,
    setEnrichedPairCatalog,
    type EnrichedPairConfig,
} from "../../catalogs/market-data-catalog.js";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
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

const marketTrade = {
    symbolId: 101,
    matchId: 22n,
    isBuy: false,
    priceTicks: 1_234_567n,
    qtyScaled: 123_456_789n,
    tsNs: 1_700_000_000_000_000_000n,
};

function seedPairCatalog(): void {
    setAssetCatalog([btc, usdt]);
    setEnrichedPairCatalog([btcUsdtPair]);
}

describe("MarketDataService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setAssetCatalog([]);
        setEnrichedPairCatalog([]);
    });

    it("normalizes public trade filters to the proto request and parses trades", async () => {
        seedPairCatalog();
        const controller = new AbortController();
        const transport = unaryTransport({ trades: [marketTrade], nextMatchId: 0n });
        const service = new MarketDataService(transport.transport, realtimeClientStub().realtime);

        const trades = await service.listTrades(
            {
                symbol: " BTC-USDT ",
                side: "buy",
                startTsNs: "1700000000123456789",
                endTsNs: "1700000001123456789",
                limit: "25",
            },
            { signal: controller.signal },
        );

        expect(transport.lastCall()?.message).toEqual({
            symbolId: 101,
            side: Proto.SideFilter.BUY,
            startTime: { seconds: 1_700_000_000n, nanos: 123_456_789 },
            endTime: { seconds: 1_700_000_001n, nanos: 123_456_789 },
            limit: 25,
        });
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(trades).toEqual([
            expect.objectContaining({
                symbolId: 101,
                matchId: 22n,
                symbolLabel: "BTC-USDT",
                sideLabel: "sell",
                qtyDisplay: "1.23456789",
                priceDisplay: "1.234567",
                tsMs: 1_700_000_000_000,
            }),
        ]);
    });

    it("returns an empty public trade list for empty backend rows", async () => {
        seedPairCatalog();
        const transport = unaryTransport({ trades: [], nextMatchId: 0n });
        const service = new MarketDataService(transport.transport, realtimeClientStub().realtime);

        await expect(service.listTrades({ symbol: "BTC-USDT" })).resolves.toEqual([]);
    });

    it("parses spot config responses at the service boundary", async () => {
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
                    allowBuyFeeFromReceived: false,
                    baseQuantityScale: 8,
                    quoteQuantityScale: 6,
                    defaultMarketSlippageBpsBuy: 25,
                    defaultMarketSlippageBpsSell: 50,
                    maxClientRefDriftBps: 10,
                    marketdata: { orderbookPriceBuckets: [0.01, 0.1] },
                    listingAt: { seconds: 1_700_000_000n, nanos: 0 },
                    status: "enabled",
                },
            ],
            tsSec: 123n,
        });
        const service = new MarketDataService(transport.transport, realtimeClientStub().realtime);

        const config = await service.getSpotConfig({ signal: controller.signal });

        expect(transport.lastCall()?.message).toEqual({});
        expect(transport.lastCall()?.signal).toBe(controller.signal);
        expect(config).toMatchObject({
            assets: [btc],
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

    it("rejects public trades that reference unknown backend symbol ids", async () => {
        seedPairCatalog();
        const transport = unaryTransport({
            trades: [{ ...marketTrade, symbolId: 999 }],
            nextMatchId: 0n,
        });
        const service = new MarketDataService(transport.transport, realtimeClientStub().realtime);

        await expect(service.listTrades({ symbol: "BTC-USDT" })).rejects.toThrow(
            /\[catalog\] market symbolId not found: 999/,
        );
    });

    it("wires public trade subscriptions and parses publications", () => {
        seedPairCatalog();
        const realtime = realtimeClientStub();
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();
        const service = new MarketDataService(unaryTransport({}).transport, realtime.realtime);

        const unsubscribe = service.subscribeTrades({
            symbol: "BTC-USDT",
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

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                symbolLabel: "BTC-USDT",
                sideLabel: "sell",
                priceDisplay: "1.234567",
            }),
        );

        unsubscribe();
        expect(realtime.connectProtoChannel.mock.results[0]?.value).toHaveBeenCalledTimes(1);
    });

    it("throws for unknown subscription symbols before connecting realtime", () => {
        const realtime = realtimeClientStub();
        const service = new MarketDataService(unaryTransport({}).transport, realtime.realtime);

        expect(() =>
            service.subscribeTrades({
                symbol: "NOPE-USDT",
                onEvent: vi.fn(),
            }),
        ).toThrow(/\[catalog\] market pairSymbol not found: NOPE-USDT/);
        expect(realtime.connectProtoChannel).not.toHaveBeenCalled();
    });

    it("throws on malformed public trade publications", () => {
        seedPairCatalog();
        const realtime = realtimeClientStub();
        const service = new MarketDataService(unaryTransport({}).transport, realtime.realtime);

        service.subscribeTrades({ symbol: "BTC-USDT", onEvent: vi.fn() });

        expect(() =>
            realtime.params?.onPublication({
                ...marketTrade,
                qtyScaled: "bad",
            } as never),
        ).toThrow();
    });
});
