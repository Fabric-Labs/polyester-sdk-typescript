import * as Proto from "../../gen/marketoverview/v1/marketoverview_pb.js";
import * as v from "valibot";
import { tsNsToMs } from "../../utils/time.js";
import type { DecodedEnum } from "../../utils/types.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { PositiveUint32InputSchema, SymbolIdInputSchema } from "../shared.js";
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

/** USD amounts are always scaled by 1e6 on the wire. */
const UsdVolumeSchema = v.pipe(
    v.bigint(),
    v.transform((value) => scaledToDecimalOutput(value, 6)),
);

const MarketOverviewRawSchema = v.object({
    symbolId: v.number(),
    lastPriceTicks: v.bigint(),
    lastTradeTsNs: v.optional(v.bigint(), 0n),
    change24hBps: v.number(),
    high24hTicks: v.bigint(),
    low24hTicks: v.bigint(),
    volume24hBaseScaled: v.optional(v.bigint()),
    volume24hQuoteScaled: v.optional(v.bigint()),
    volume24hUsdScaled: v.optional(UsdVolumeSchema),
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
                volume24hBase:
                    m.volume24hBaseScaled === undefined
                        ? undefined
                        : scaledToDecimalOutput(m.volume24hBaseScaled, baseQtyScale),
                volume24hQuote:
                    m.volume24hQuoteScaled === undefined
                        ? undefined
                        : scaledToDecimalOutput(m.volume24hQuoteScaled, quoteAmountScale),
                volume24hUsd: m.volume24hUsdScaled,
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
        limit: v.optional(PositiveUint32InputSchema, 500),
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
        orderBy: v.pipe(
            v.optional(MarketOverviewOrderBySchema, "volume_24h_usd"),
            v.transform((v) => MarketOverviewOrderByCodec.inputToProto[v ?? "volume_24h_usd"]),
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

export const SpotVolumeHistoryInputSchema = v.pipe(
    v.strictObject({
        symbolIds: v.optional(
            v.pipe(
                v.array(SymbolIdInputSchema),
                v.transform((ids) => [...new Set(ids)]),
                v.maxLength(2000),
            ),
            [],
        ),
    }),
    v.transform(({ symbolIds }) => ({ symbolId: symbolIds })),
);
export type SpotVolumeHistoryInput = v.InferInput<typeof SpotVolumeHistoryInputSchema>;

export const SpotPairVolumeSeriesSchema = v.pipe(
    v.object({ symbolId: v.number(), volumeUsdScaled: v.array(UsdVolumeSchema) }),
    v.transform(({ symbolId, volumeUsdScaled }) => ({ symbolId, volumeUsd: volumeUsdScaled })),
);
export type SpotPairVolumeSeries = v.InferOutput<typeof SpotPairVolumeSeriesSchema>;

export const SpotVolumeHistoryResponseSchema = v.pipe(
    v.object({
        bucket: v.string(),
        startTsSec: v.number(),
        endTsSec: v.number(),
        points: v.number(),
        pairs: v.array(SpotPairVolumeSeriesSchema),
        totalVolumeUsdScaled: v.array(UsdVolumeSchema),
    }),
    v.transform(({ totalVolumeUsdScaled, ...response }) => ({
        ...response,
        totalVolumeUsd: totalVolumeUsdScaled,
    })),
);
export type SpotVolumeHistoryResponse = v.InferOutput<typeof SpotVolumeHistoryResponseSchema>;

export const CurrencyMetadataSchema = v.object({
    code: v.string(),
    defaultEnglishName: v.string(),
    symbol: v.string(),
    fractionDigits: v.number(),
});
export type CurrencyMetadata = v.InferOutput<typeof CurrencyMetadataSchema>;

export const CurrencyConversionConfigSchema = v.object({
    fiat: v.array(CurrencyMetadataSchema),
    stablecoins: v.array(CurrencyMetadataSchema),
});
export type CurrencyConversionConfig = v.InferOutput<typeof CurrencyConversionConfigSchema>;

const ConversionRateSchema = v.pipe(
    v.bigint(),
    v.transform((value) => scaledToDecimalOutput(value, 8)),
);
const ConversionTimestampSchema = v.pipe(
    v.bigint(),
    v.transform((value) => Number(value * 1000n)),
    v.safeInteger(),
);

export const FiatConversionRateSchema = v.pipe(
    v.object({ code: v.string(), unitsPerUsdE8: ConversionRateSchema }),
    v.transform(({ code, unitsPerUsdE8 }) => ({ code, unitsPerUsd: unitsPerUsdE8 })),
);
export type FiatConversionRate = v.InferOutput<typeof FiatConversionRateSchema>;

export const FiatConversionSnapshotSchema = v.pipe(
    v.object({
        rates: v.array(FiatConversionRateSchema),
        sourceTsSec: ConversionTimestampSchema,
        stale: v.boolean(),
    }),
    v.transform(({ sourceTsSec, ...snapshot }) => ({ ...snapshot, sourceTsMs: sourceTsSec })),
);
export type FiatConversionSnapshot = v.InferOutput<typeof FiatConversionSnapshotSchema>;

export const StablecoinConversionRateSchema = v.pipe(
    v.object({
        code: v.string(),
        usdPerUnitE8: ConversionRateSchema,
        sourceTsSec: ConversionTimestampSchema,
        stale: v.boolean(),
    }),
    v.transform(({ usdPerUnitE8, sourceTsSec, ...rate }) => ({
        ...rate,
        usdPerUnit: usdPerUnitE8,
        sourceTsMs: sourceTsSec,
    })),
);
export type StablecoinConversionRate = v.InferOutput<typeof StablecoinConversionRateSchema>;

export const CurrencyConversionRatesSchema = v.pipe(
    v.object({
        fiat: v.optional(FiatConversionSnapshotSchema),
        stablecoins: v.array(StablecoinConversionRateSchema),
        snapshotTsSec: ConversionTimestampSchema,
    }),
    v.transform(({ snapshotTsSec, ...response }) => ({ ...response, snapshotTsMs: snapshotTsSec })),
);
export type CurrencyConversionRates = v.InferOutput<typeof CurrencyConversionRatesSchema>;
