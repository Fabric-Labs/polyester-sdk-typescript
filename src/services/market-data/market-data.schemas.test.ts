import { afterEach, describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import {
    setAssetCatalog,
    setEnrichedPairCatalog,
    type EnrichedPairConfig,
} from "../../catalogs/market-data-catalog.js";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import {
    GetMarketTradesInputSchema,
    MarketTradeSchema,
    SpotConfigSchema,
} from "./market-data.schemas.js";

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
    setAssetCatalog([btc, usdt]);
    setEnrichedPairCatalog([btcUsdtPair]);
}

describe("market data schemas", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setAssetCatalog([]);
        setEnrichedPairCatalog([]);
    });

    it("maps market trade filters to proto request fields", () => {
        seedPairCatalog();

        const input = v.parse(GetMarketTradesInputSchema, {
            symbol: " BTC-USDT ",
            side: "sell",
            startTsNs: " 1700000000123456789 ",
            endTsNs: "1700000001123456789",
            limit: " 50 ",
        });

        expect(input).toEqual({
            symbolId: 101,
            side: Proto.SideFilter.SELL,
            startTime: { seconds: 1_700_000_000n, nanos: 123_456_789 },
            endTime: { seconds: 1_700_000_001n, nanos: 123_456_789 },
            limit: 50,
        });
    });

    it("omits absent optional trade filters", () => {
        seedPairCatalog();

        const input = v.parse(GetMarketTradesInputSchema, { symbol: "BTC-USDT" });

        expect(input).toEqual({
            symbolId: 101,
            side: undefined,
            startTime: undefined,
            endTime: undefined,
            limit: undefined,
        });
    });

    it("rejects invalid trade filter inputs", () => {
        seedPairCatalog();
        const cases = [
            { symbol: "NOPE-USDT" },
            { symbol: "BTC-USDT", side: "both" },
            { symbol: "BTC-USDT", startTsNs: "not-a-ts" },
            { symbol: "BTC-USDT", endTsNs: "12.3" },
        ];

        for (const input of cases) {
            expect(() => v.parse(GetMarketTradesInputSchema, input)).toThrow();
        }
    });

    it("parses public trades with catalog metadata and display fields", () => {
        seedPairCatalog();

        const trade = v.parse(MarketTradeSchema, {
            symbolId: 101,
            matchId: 22n,
            isBuy: false,
            priceTicks: 1_234_567n,
            qtyScaled: 123_456_789n,
            tsNs: 1_700_000_000_000_000_000n,
        });

        expect(trade).toMatchObject({
            symbolId: 101,
            symbolLabel: "BTC-USDT",
            sideLabel: "sell",
            qtyDisplay: "1.23456789",
            priceDisplay: "1.234567",
            tsMs: 1_700_000_000_000,
        });
    });

    it("parses spot config defaults and timestamp fields", () => {
        const config = v.parse(SpotConfigSchema, {
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
                    listingAt: { seconds: 1_700_000_000n, nanos: 0 },
                    status: "enabled",
                },
            ],
            tsSec: 123n,
        });

        expect(config.assets[0]).toEqual(btc);
        expect(config.pairs[0]).toMatchObject({
            symbolId: 101,
            defaultMarketSlippagePctBuy: 0,
            defaultMarketSlippagePctSell: 0,
            maxClientRefDriftPct: 0,
            listingAt: 1_700_000_000_000,
            status: "enabled",
        });
        expect(config.tsSec).toBe(123_000);
    });
});
