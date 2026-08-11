import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
    MarketOrderBy,
    MarketOverviewSchema,
    SortDirection,
    SparklineInterval,
} from "../../gen/marketoverview/v1/marketoverview_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    createMarketOverviewSchema,
    getMarketOverview24hChangeDisplay,
    ListMarketOverviewInputSchema,
    type MarketOverview,
} from "./market-overview.schemas.js";

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

describe("MarketOverviewSchema", () => {
    it("converts market values into decimal strings", () => {
        const schema = createMarketOverviewSchema(testScales());
        const market = v.parse(schema, {
            symbolId: 101,
            symbol: "BTC-USDT",
            lastPriceTicks: 1_234_567_890n,
            lastTradeTsNs: 1_700_000_000_123_456_789n,
            change24hBps: 123,
            high24hTicks: 2_000_123_456n,
            low24hTicks: 999_999_999n,
            volume24hBaseScaled: 123_456_789n,
            volume24hQuoteScaled: 987_654_321n,
            listedTsNs: 1_700_000_000_000_000_000n,
            bestBidTicks: 1_234_500_001n,
            bestBidQtyScaled: 12_345_678n,
            bestAskTicks: 1_234_600_002n,
            bestAskQtyScaled: 23_456_789n,
            indexPriceTicks: 1_234_550_003n,
            sparklines: [
                {
                    interval: SparklineInterval.SPARKLINE_24H,
                    closeTicks: [1_010_000n, 1_000_001n],
                },
            ],
        });

        expect(market).toEqual({
            symbolId: 101,
            symbol: "BTC-USDT",
            lastPrice: "1234.56789",
            lastTradeTsMs: 1_700_000_000_123,
            change24hBps: 123,
            high24h: "2000.123456",
            low24h: "999.999999",
            volume24hBase: "1.23456789",
            volume24hQuote: "987.654321",
            listedTsMs: 1_700_000_000_000,
            bestBid: "1234.500001",
            bestBidQty: "0.12345678",
            bestAsk: "1234.600002",
            bestAskQty: "0.23456789",
            indexPrice: "1234.550003",
            sparklines: [{ interval: "24h", close: ["1.000001", "1.01"] }],
        });

        const unavailableIndexPrice = v.parse(
            schema,
            create(MarketOverviewSchema, { symbolId: 101, indexPriceTicks: 0n }),
        );
        expect(unavailableIndexPrice.indexPrice).toBeUndefined();
    });

    it("computes display-only 24h change from decimal sparkline closes", () => {
        const market: Pick<MarketOverview, "change24hBps" | "listedTsMs" | "sparklines"> = {
            change24hBps: 0,
            listedTsMs: Date.now() - 1_000,
            sparklines: [{ interval: "24h", close: ["1.5", "3"] }],
        };

        expect(getMarketOverview24hChangeDisplay(market)).toEqual({
            change24hBps: 10_000,
            showNewListingSparklineInfo: true,
        });
    });
});

describe("ListMarketOverviewInputSchema", () => {
    it("maps list filters, sort, and sparkline intervals to proto values", () => {
        const input = v.parse(ListMarketOverviewInputSchema, {
            symbols: [" BTC-USDT ", " ETH-USDT "],
            orderBy: "last_price",
            sort: "asc",
            includeSparklines: false,
            sparklineIntervals: ["1h", "1w"],
        });

        expect(input).toEqual({
            symbols: ["BTC-USDT", "ETH-USDT"],
            limit: 500,
            pageToken: "",
            orderBy: MarketOrderBy.ORDER_BY_LAST_PRICE,
            sort: SortDirection.SORT_ASC,
            includeSparklines: false,
            sparklineIntervals: [SparklineInterval.SPARKLINE_1H, SparklineInterval.SPARKLINE_1W],
        });
    });

    it("rejects invalid list input values", () => {
        const cases = [
            { symbols: [" "] },
            { limit: 0 },
            { orderBy: "name" },
            { sort: "newest" },
            { sparklineIntervals: ["12h"] },
        ];

        for (const input of cases) {
            expect(() => v.parse(ListMarketOverviewInputSchema, input)).toThrow();
        }
    });
});
