import * as Proto from "../../gen/marketoverview/v1/marketoverview_pb.js";
import * as v from "valibot";
import { tsNsToMs } from "../../utils/time.js";
import type { DecodedEnum } from "../../utils/types.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { SymbolIdInputSchema } from "../shared.js";
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

const MarketOverviewSparklineRawSchema = v.object({
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
    interval: DecodedEnum<SparklineIntervalName>;
    close: string[];
};

export const MarketOverviewOrderBySchema = v.picklist(MARKET_OVERVIEW_ORDER_BY_VALUES);

export type MarketOverviewOrderBy = v.InferOutput<typeof MarketOverviewOrderBySchema>;

export const MarketOverviewSortSchema = v.picklist(MARKET_OVERVIEW_SORT_VALUES);

export type MarketOverviewSort = v.InferOutput<typeof MarketOverviewSortSchema>;

const MarketOverviewRawSchema = v.object({
    symbolId: SymbolIdInputSchema,
    lastPriceTicks: v.bigint(),
    lastTradeTsNs: v.optional(v.bigint(), 0n),
    change24hBps: v.number(),
    high24hTicks: v.bigint(),
    low24hTicks: v.bigint(),
    volume24hBaseScaled: v.bigint(),
    volume24hQuoteScaled: v.bigint(),
    listedTsNs: v.optional(v.bigint(), 0n),
    bestBidTicks: v.bigint(),
    bestBidQtyScaled: v.bigint(),
    bestAskTicks: v.bigint(),
    bestAskQtyScaled: v.bigint(),
    sparklines: v.optional(v.array(MarketOverviewSparklineRawSchema), []),
    indexPriceTicks: v.bigint(),
});

export function createMarketOverviewSchema(scales: SdkScales) {
    return v.pipe(
        MarketOverviewRawSchema,
        v.transform((m) => {
            const priceScale = scales.price();
            const baseQtyScale = scales.baseQty(m.symbolId);
            const quoteAmountScale = scales.quoteAmount(m.symbolId);
            return {
                symbolId: m.symbolId,
                lastPrice: scaledToDecimalOutput(m.lastPriceTicks, priceScale),
                lastTradeTsMs: tsNsToMs(m.lastTradeTsNs),
                change24hBps: m.change24hBps,
                high24h: scaledToDecimalOutput(m.high24hTicks, priceScale),
                low24h: scaledToDecimalOutput(m.low24hTicks, priceScale),
                volume24hBase: scaledToDecimalOutput(m.volume24hBaseScaled, baseQtyScale),
                volume24hQuote: scaledToDecimalOutput(m.volume24hQuoteScaled, quoteAmountScale),
                listedTsMs: tsNsToMs(m.listedTsNs),
                bestBid: scaledToDecimalOutput(m.bestBidTicks, priceScale),
                bestBidQty: scaledToDecimalOutput(m.bestBidQtyScaled, baseQtyScale),
                bestAsk: scaledToDecimalOutput(m.bestAskTicks, priceScale),
                bestAskQty: scaledToDecimalOutput(m.bestAskQtyScaled, baseQtyScale),
                indexPrice:
                    m.indexPriceTicks > 0n
                        ? scaledToDecimalOutput(m.indexPriceTicks, priceScale)
                        : undefined,
                sparklines: (m.sparklines ?? []).map(
                    (s): MarketOverviewSparkline => ({
                        interval: s.interval,
                        close: s.closeTicks
                            .map((tick) => scaledToDecimalOutput(tick, priceScale))
                            .reverse(),
                    }),
                ),
            };
        }),
    );
}

export type MarketOverview = v.InferOutput<ReturnType<typeof createMarketOverviewSchema>>;

const MS_PER_24H = 86_400_000;

function change24hBpsFromSparklineFirstLast(sparklines: MarketOverview["sparklines"]): number {
    const s = sparklines.find((e) => e.interval === "24h") ?? sparklines[0];
    if (!s || s.close.length < 2) return 0;
    const first = Number(s.close[0] ?? 0);
    const last = Number(s.close.at(-1) ?? 0);
    if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
    if (first === 0) return 0;
    return Math.round(((last - first) / first) * 10_000);
}

/**
 * Formats the 24-hour market change percentage for display.
 */
export function getMarketOverview24hChangeDisplay(
    market: Pick<MarketOverview, "change24hBps" | "listedTsMs" | "sparklines">,
    nowMs: number = Date.now(),
): { change24hBps: number; showNewListingSparklineInfo: boolean } {
    const api = market.change24hBps;
    const newish = api === 0 && market.listedTsMs > 0 && nowMs - market.listedTsMs < MS_PER_24H;
    if (!newish) {
        return { change24hBps: api, showNewListingSparklineInfo: false };
    }
    return {
        change24hBps: change24hBpsFromSparklineFirstLast(market.sparklines),
        showNewListingSparklineInfo: true,
    };
}

export type MarketOverviewBatch = {
    markets: MarketOverview[];
    tsNs: bigint;
};

export const ListMarketOverviewInputSchema = v.pipe(
    v.strictObject({
        symbolIds: v.optional(v.array(SymbolIdInputSchema), []),
        limit: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0)), 500),
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
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
    }),
    v.transform(({ symbolIds, ...input }) => ({ symbolId: symbolIds, ...input })),
);

export type ListMarketOverviewInput = v.InferInput<typeof ListMarketOverviewInputSchema>;
