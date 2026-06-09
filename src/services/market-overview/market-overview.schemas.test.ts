import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
    MarketOrderBy,
    SortDirection,
    SparklineInterval,
} from "../../gen/marketoverview/v1/marketoverview_pb.js";
import {
    createMarketOverviewSchema,
    getMarketOverview24hChangeDisplay,
    ListMarketOverviewInputSchema,
    type MarketOverview,
} from "./market-overview.schemas.js";

describe("MarketOverviewSchema", () => {
    it("preserves raw market values as strings", () => {
        const schema = createMarketOverviewSchema();
        const market = v.parse(schema, {
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

        expect(market).toEqual({
            symbolId: 101,
            symbol: "BTC-USDT",
            lastPriceTicks: "1234567890",
            lastTradeTsMs: 1_700_000_000_123,
            change24hBp: 123,
            high24hTicks: "2000123456",
            low24hTicks: "999999999",
            volume24hBaseScaled: "123456789",
            volume24hQuoteScaled: "987654321",
            listedTsMs: 1_700_000_000_000,
            bestBidTicks: "1234500001",
            bestBidQtyScaled: "12345678",
            bestAskTicks: "1234600002",
            bestAskQtyScaled: "23456789",
            sparklines: [{ interval: "24h", closeTicks: ["1000001", "1010000"] }],
        });
    });

    it("computes display-only 24h change from raw sparkline ticks", () => {
        const market: Pick<MarketOverview, "change24hBp" | "listedTsMs" | "sparklines"> = {
            change24hBp: 0,
            listedTsMs: Date.now() - 1_000,
            sparklines: [{ interval: "24h", closeTicks: ["1500000", "3000000"] }],
        };

        expect(getMarketOverview24hChangeDisplay(market)).toEqual({
            change24hBp: 10_000,
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
            page: 1,
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
            { page: 0 },
            { orderBy: "name" },
            { sort: "newest" },
            { sparklineIntervals: ["12h"] },
        ];

        for (const input of cases) {
            expect(() => v.parse(ListMarketOverviewInputSchema, input)).toThrow();
        }
    });
});
