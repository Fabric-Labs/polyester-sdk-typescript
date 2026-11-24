import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { fromBinary, toBinary } from "@bufbuild/protobuf";
import { ValidationError } from "../../shared/errors.js";
import { parse } from "../../shared/validation.js";
import {
    ListMarketOverviewRequestSchema,
    MarketOrderBy,
    MarketOverviewSchema,
    RollingWindowStatsSchema,
    SortDirection,
    SparklineInterval,
} from "../../gen/marketoverview/v1/marketoverview_pb.js";
import { LivePriceBandSchema, PriceBandState } from "../../gen/marketdata/v1/marketdata_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { PROTOBUF_INT64_MAX, PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
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
    it("carries the live price band when the row has one", () => {
        const schema = createMarketOverviewSchema(testScales());
        const row = create(MarketOverviewSchema, {
            symbolId: 101,
            priceBand: create(LivePriceBandSchema, {
                symbolId: 101,
                state: PriceBandState.ACTIVE,
                maxBuyPriceTicks: 64_050_250_000_000n,
            }),
        });

        expect(v.parse(schema, row).priceBand).toMatchObject({
            symbolId: 101,
            state: "active",
            maxBuyPrice: "64050.25",
        });
        expect(v.parse(schema, create(MarketOverviewSchema, { symbolId: 101 })).priceBand).toBe(
            undefined,
        );
    });

    it("converts market values into decimal strings", () => {
        const schema = createMarketOverviewSchema(testScales());
        const market = v.parse(schema, {
            symbolId: 101,
            lastPriceTicks: 1_234_567_890_000n,
            lastTradeTsNs: 1_700_000_000_123_456_789n,
            change24hBps: 123,
            high24hTicks: 2_000_123_456_000n,
            low24hTicks: 999_999_999_000n,
            volume24hBaseScaled: 123_456_789n,
            volume24hQuoteScaled: 987_654_321n,
            listedTsNs: 1_700_000_000_000_000_000n,
            bestBidTicks: 1_234_500_001_000n,
            bestBidQtyScaled: 12_345_678n,
            bestAskTicks: 1_234_600_002_000n,
            bestAskQtyScaled: 23_456_789n,
            indexPriceTicks: 1_234_550_003_000n,
            sparklines: [
                {
                    interval: SparklineInterval.SPARKLINE_24H,
                    closeTicks: [1_010_000_000n, 1_000_001_000n],
                },
            ],
        });

        expect(market).toEqual({
            symbolId: 101,
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
            tradeCount24h: "0",
            sparklines: [{ interval: "24h", close: ["1.000001", "1.01"] }],
        });

        const unavailableIndexPrice = v.parse(
            schema,
            create(MarketOverviewSchema, { symbolId: 101, indexPriceTicks: 0n }),
        );
        expect(unavailableIndexPrice.indexPrice).toBeUndefined();
    });

    it("surfaces rolling window stats, the 24h and UTC day opens, trade count and VWAP", () => {
        const schema = createMarketOverviewSchema(testScales());
        const stats = (openTicks: bigint, changeBps: number) =>
            create(RollingWindowStatsSchema, {
                openTicks,
                highTicks: 62_000_000_000_000n,
                lowTicks: 57_000_000_000_000n,
                changeBps,
            });
        const market = v.parse(
            schema,
            create(MarketOverviewSchema, {
                symbolId: 101,
                open24hTicks: 60_000_000_000_000n,
                tradeCount24h: 1_834n,
                vwap24hTicks: 60_812_345_678_901n,
                openUtcDayTicks: 60_750_000_000_000n,
                stats1h: stats(61_200_000_000_000n, 49),
                stats4h: stats(60_500_000_000_000n, 165),
                stats7d: stats(58_000_000_000_000n, -603),
            }),
        );

        expect(market).toMatchObject({
            open24h: "60000",
            tradeCount24h: "1834",
            vwap24h: "60812.345678901",
            openUtcDay: "60750",
            stats1h: { open: "61200", high: "62000", low: "57000", changeBps: 49 },
            stats4h: { open: "60500", changeBps: 165 },
            stats7d: { open: "58000", changeBps: -603 },
        });
    });

    it("reports unknown opens, VWAP and windows as undefined", () => {
        const market = v.parse(
            createMarketOverviewSchema(testScales()),
            create(MarketOverviewSchema, { symbolId: 101 }),
        );

        expect(market).toMatchObject({ change24hBps: 0, tradeCount24h: "0" });
        for (const field of ["open24h", "vwap24h", "openUtcDay", "stats1h", "stats4h", "stats7d"]) {
            expect(market[field as keyof MarketOverview]).toBeUndefined();
        }
    });

    it("scales 24h base volume by marketDataVolumeScale, not the quantity scale", () => {
        const schema = createMarketOverviewSchema(
            createCatalogSdkScales(() =>
                createTestCatalog({
                    assets: [{ ...BTC, marketDataVolumeScale: 4 }, USDT],
                    pairs: [BTC_USDT],
                }),
            ),
        );
        const market = v.parse(
            schema,
            create(MarketOverviewSchema, {
                symbolId: 101,
                volume24hBaseScaled: 12_345n,
                bestBidQtyScaled: 12_345n,
            }),
        );

        expect(market.volume24hBase).toBe("1.2345");
        expect(market.bestBidQty).toBe("0.00012345");
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
            symbolIds: [101, PROTOBUF_UINT32_MAX],
            orderBy: "last_price",
            sort: "asc",
            includeSparklines: false,
            sparklineIntervals: ["1h", "1w"],
        });

        expect(input).toEqual({
            symbolId: [101, PROTOBUF_UINT32_MAX],
            limit: 500,
            pageToken: "",
            orderBy: MarketOrderBy.ORDER_BY_LAST_PRICE,
            sort: SortDirection.SORT_ASC,
            includeSparklines: false,
            sparklineIntervals: [SparklineInterval.SPARKLINE_1H, SparklineInterval.SPARKLINE_1W],
        });
    });

    it("defaults to USD volume sorting and rejects the removed quote-volume key", () => {
        expect(v.parse(ListMarketOverviewInputSchema, {}).orderBy).toBe(
            MarketOrderBy.ORDER_BY_VOLUME_24H_USD,
        );
        expect(v.parse(ListMarketOverviewInputSchema, { orderBy: "volume_24h_usd" }).orderBy).toBe(
            MarketOrderBy.ORDER_BY_VOLUME_24H_USD,
        );
        expect(() =>
            v.parse(ListMarketOverviewInputSchema, { orderBy: "volume_24h_quote" }),
        ).toThrow();
    });

    it("maps range filters to scaled, encodable proto bounds", () => {
        const input = v.parse(ListMarketOverviewInputSchema, {
            lastPrice: { min: "0", max: "65000.5" },
            change24hBps: { min: -500, max: 1000 },
            volume24hUsd: { min: "1000000" },
        });

        expect(input).toMatchObject({
            lastPrice: { minTicks: 0n, maxTicks: 65_000_500_000_000n },
            change24h: { minBps: -500, maxBps: 1000 },
            volume24h: { minUsdScaled: 1_000_000_000_000n, maxUsdScaled: undefined },
        });
        const encoded = toBinary(
            ListMarketOverviewRequestSchema,
            create(ListMarketOverviewRequestSchema, input),
        );
        expect(
            fromBinary(ListMarketOverviewRequestSchema, encoded).volume24h?.maxUsdScaled,
        ).toBeUndefined();
        expect(v.parse(ListMarketOverviewInputSchema, {}).lastPrice).toBeUndefined();
    });

    it("rejects range bounds the wire cannot carry", () => {
        const cases = [
            { lastPrice: { min: "-1" } },
            { lastPrice: { max: "0.0000000001" } },
            { lastPrice: { max: (PROTOBUF_INT64_MAX + 1n).toString() } },
            { volume24hUsd: { min: "0.0000001" } },
            { change24hBps: { min: 2 ** 31 } },
            { change24hBps: { max: 1.5 } },
            { change24hBps: { below: 1 } },
        ];

        for (const input of cases) {
            expect(() => parse(ListMarketOverviewInputSchema, input)).toThrow(ValidationError);
        }
    });

    it("rejects invalid list input values", () => {
        const cases = [
            { symbols: [101] },
            { symbolIds: [0] },
            { symbolIds: [PROTOBUF_UINT32_MAX + 1] },
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
