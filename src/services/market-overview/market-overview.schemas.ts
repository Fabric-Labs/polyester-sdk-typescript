import * as Proto from "../../gen/marketoverview/v1/marketoverview_pb.js";
import * as v from "valibot";
import { tsNsToMs } from "../../utils/time.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import {
    SPARKLINE_INTERVAL_VALUES,
    MARKET_OVERVIEW_ORDER_BY_VALUES,
    MARKET_OVERVIEW_SORT_VALUES,
    SparklineIntervalCodec,
    MarketOverviewOrderByCodec,
    MarketOverviewSortCodec,
} from "./market-overview.codecs.js";

export {
    SPARKLINE_INTERVAL_VALUES,
    MARKET_OVERVIEW_ORDER_BY_VALUES,
    MARKET_OVERVIEW_SORT_VALUES,
} from "./market-overview.codecs.js";

export {
    MarketOrderBy,
    SortDirection,
    SparklineInterval,
} from "../../gen/marketoverview/v1/marketoverview_pb.js";

export const SparklineIntervalSchema = v.picklist(SPARKLINE_INTERVAL_VALUES);

export type SparklineIntervalName = v.InferOutput<typeof SparklineIntervalSchema>;

export const MarketOverviewSparklineSchema = v.object({
    interval: v.pipe(
        v.enum(Proto.SparklineInterval),
        v.transform((value) =>
            requiredEnumLabel(
                SparklineIntervalCodec.protoToOutput,
                value,
                "MarketOverviewSparklineSchema",
                "interval",
            ),
        ),
    ),
    closeTicks: v.array(v.bigint()),
});

export type MarketOverviewSparkline = {
    interval: SparklineIntervalName;
    closeTicks: string[];
};

export const MarketOverviewOrderBySchema = v.picklist(MARKET_OVERVIEW_ORDER_BY_VALUES);

export type MarketOverviewOrderBy = v.InferOutput<typeof MarketOverviewOrderBySchema>;

export const MarketOverviewSortSchema = v.picklist(MARKET_OVERVIEW_SORT_VALUES);

export type MarketOverviewSort = v.InferOutput<typeof MarketOverviewSortSchema>;

export const MarketOverviewSchema = v.pipe(
    v.object({
        symbolId: v.number(),
        symbol: v.string(),
        lastPriceTicks: v.bigint(),
        lastTradeTsNs: v.optional(v.bigint(), 0n),
        change24hBp: v.number(),
        high24hTicks: v.bigint(),
        low24hTicks: v.bigint(),
        volume24hBaseScaled: v.bigint(),
        volume24hQuoteScaled: v.bigint(),
        listedTsNs: v.optional(v.bigint(), 0n),
        bestBidTicks: v.bigint(),
        bestBidQtyScaled: v.bigint(),
        bestAskTicks: v.bigint(),
        bestAskQtyScaled: v.bigint(),
        sparklines: v.optional(v.array(MarketOverviewSparklineSchema), []),
    }),
    v.transform((m) => ({
        symbolId: m.symbolId,
        symbol: m.symbol,
        lastPriceTicks: m.lastPriceTicks.toString(),
        lastTradeTsMs: tsNsToMs(m.lastTradeTsNs),
        change24hBp: m.change24hBp,
        high24hTicks: m.high24hTicks.toString(),
        low24hTicks: m.low24hTicks.toString(),
        volume24hBaseScaled: m.volume24hBaseScaled.toString(),
        volume24hQuoteScaled: m.volume24hQuoteScaled.toString(),
        listedTsMs: tsNsToMs(m.listedTsNs),
        bestBidTicks: m.bestBidTicks.toString(),
        bestBidQtyScaled: m.bestBidQtyScaled.toString(),
        bestAskTicks: m.bestAskTicks.toString(),
        bestAskQtyScaled: m.bestAskQtyScaled.toString(),
        sparklines: (m.sparklines ?? []).map((s) => ({
            interval: s.interval,
            closeTicks: s.closeTicks.map((t) => t.toString()).reverse(),
        })),
    })),
);

export function createMarketOverviewSchema() {
    return MarketOverviewSchema;
}

export type MarketOverview = v.InferOutput<typeof MarketOverviewSchema>;

const MS_PER_24H = 86_400_000;

function change24hBpFromSparklineFirstLast(sparklines: MarketOverview["sparklines"]): number {
    const s = sparklines.find((e) => e.interval === "24h") ?? sparklines[0];
    if (!s || s.closeTicks.length < 2) return 0;
    const first = Number(s.closeTicks[0] ?? 0);
    const last = Number(s.closeTicks.at(-1) ?? 0);
    if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
    if (first === 0) return 0;
    return Math.round(((last - first) / first) * 10_000);
}

/**
 * Formats the 24-hour market change percentage for display.
 */
export function getMarketOverview24hChangeDisplay(
    market: Pick<MarketOverview, "change24hBp" | "listedTsMs" | "sparklines">,
    nowMs: number = Date.now(),
): { change24hBp: number; showNewListingSparklineInfo: boolean } {
    const api = market.change24hBp;
    const newish = api === 0 && market.listedTsMs > 0 && nowMs - market.listedTsMs < MS_PER_24H;
    if (!newish) {
        return { change24hBp: api, showNewListingSparklineInfo: false };
    }
    return {
        change24hBp: change24hBpFromSparklineFirstLast(market.sparklines),
        showNewListingSparklineInfo: true,
    };
}

export type MarketOverviewBatch = {
    markets: MarketOverview[];
    tsNs: bigint;
};

export const ListMarketOverviewInputSchema = v.object({
    symbols: v.optional(v.array(v.pipe(v.string(), v.trim(), v.minLength(1))), []),
    limit: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0)), 500),
    page: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0)), 1),
    orderBy: v.pipe(
        v.optional(MarketOverviewOrderBySchema, "volume_24h_quote"),
        v.transform((v) => MarketOverviewOrderByCodec.inputToProto[v ?? "volume_24h_quote"]),
    ),
    sort: v.pipe(
        v.optional(MarketOverviewSortSchema, "desc"),
        v.transform((v) => MarketOverviewSortCodec.inputToProto[v ?? "desc"]),
    ),
    includeSparklines: v.optional(v.boolean(), true),
    sparklineIntervals: v.pipe(
        v.optional(v.array(SparklineIntervalSchema), ["24h"]),
        v.transform((intervals) =>
            (intervals ?? ["24h"]).map((v) => SparklineIntervalCodec.inputToProto[v]),
        ),
    ),
});

export type ListMarketOverviewInput = v.InferInput<typeof ListMarketOverviewInputSchema>;
