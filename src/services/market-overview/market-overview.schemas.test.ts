import { describe, expect, it, beforeEach } from "vitest";
import * as v from "valibot";
import { SparklineInterval } from "../../gen/marketoverview/v1/marketoverview_pb.js";
import {
    setAssetCatalog,
    setEnrichedPairCatalog,
    type EnrichedPairConfig,
} from "../../catalogs/market-data-catalog.js";
import {
    getMarketOverview24hChangeDisplay,
    MarketOverviewSchema,
    type MarketOverview,
} from "./market-overview.schemas.js";

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
    listingAt: 1_700_000_000_000,
    delistingAt: null,
    status: "enabled",
};

describe("MarketOverviewSchema", () => {
    beforeEach(() => {
        setAssetCatalog([btc, usdt]);
        setEnrichedPairCatalog([btcUsdtPair]);
    });

    it("preserves fractional market values as decimal strings", () => {
        const market = v.parse(MarketOverviewSchema, {
            symbolId: 101,
            symbol: "BTC-USDT",
            lastPriceTicks: 1_234_567_890n,
            lastTradeTsNs: 1_700_000_000_123_456_789n,
            change24hBp: 123,
            high24hTicks: 2_000_123_456n,
            low24hTicks: 999_999_999n,
            volume24hBaseScaled: 123_456_789n,
            volume24hQuoteScaled: 987_654_321n,
            listedTsNs: 1_700_000_000_000_000_000n,
            bestBidTicks: 1_234_500_001n,
            bestBidQtyScaled: 12_345_678n,
            bestAskTicks: 1_234_600_002n,
            bestAskQtyScaled: 23_456_789n,
            sparklines: [
                {
                    interval: SparklineInterval.SPARKLINE_24H,
                    closeTicks: [1_010_000n, 1_000_001n],
                },
            ],
        });

        expect(market).toMatchObject({
            lastPrice: "1234.56789",
            high24h: "2000.123456",
            low24h: "999.999999",
            volume24hBase: "1.23456789",
            volume24hQuote: "987.654321",
            bestBid: "1234.500001",
            bestBidQty: "0.12345678",
            bestAsk: "1234.600002",
            bestAskQty: "0.23456789",
            sparklines: [{ interval: "24h", prices: ["1.000001", "1.01"] }],
        });
    });

    it("computes display-only 24h change from decimal string sparkline prices", () => {
        const market: Pick<MarketOverview, "change24hBp" | "listedTsMs" | "sparklines"> = {
            change24hBp: 0,
            listedTsMs: Date.now() - 1_000,
            sparklines: [{ interval: "24h", prices: ["1.5", "3"] }],
        };

        expect(getMarketOverview24hChangeDisplay(market)).toEqual({
            change24hBp: 10_000,
            showNewListingSparklineInfo: true,
        });
    });
});
