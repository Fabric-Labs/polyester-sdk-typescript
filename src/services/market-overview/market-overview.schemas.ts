import * as v from "valibot";
import { tsNsToMs } from "../../utils/time.js";
import type { DecodedEnum } from "../../utils/types.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    decimalInputToScaled,
    scaledToDecimalOutput,
    type SdkScales,
} from "../../shared/decimal-surface.js";
import { PRICE_SCALE } from "../../catalogs/readers.js";
import { PROTOBUF_INT32_MAX, PROTOBUF_INT64_MAX } from "../../shared/wire-bounds.js";
import { PositiveUint32InputSchema, SymbolIdInputSchema } from "../shared.js";
import type { LivePriceBand as ProtoLivePriceBand } from "../../gen/marketdata/v1/marketdata_pb.js";
import { formatLivePriceBand } from "../market-data/market-data.schemas.js";
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
    interval: enumLabelSchema(SparklineIntervalCodec.protoToOutput),
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

const RollingWindowStatsRawSchema = v.object({
    openTicks: v.bigint(),
    highTicks: v.bigint(),
    lowTicks: v.bigint(),
    changeBps: v.number(),
});

/**
 * Trade prices over a rolling window that ends now and starts at the start of the minute one
 * window length ago, as decimal strings in quote units.
 */
export type MarketOverviewRollingWindowStats = {
    /** Last trade price before the window, or the market's first trade if it traded later. */
    open: string;
    /** Highest price in the window, counting the open and every trade. */
    high: string;
    /** Lowest price in the window, counting the open and every trade. */
    low: string;
    /** Change from the open to the last price in basis points, truncated toward zero. */
    changeBps: number;
};

function formatRollingWindowStats(
    stats: v.InferOutput<typeof RollingWindowStatsRawSchema> | undefined,
    priceScale: number,
): MarketOverviewRollingWindowStats | undefined {
    return stats
        ? {
              open: scaledToDecimalOutput(stats.openTicks, priceScale),
              high: scaledToDecimalOutput(stats.highTicks, priceScale),
              low: scaledToDecimalOutput(stats.lowTicks, priceScale),
              changeBps: stats.changeBps,
          }
        : undefined;
}

/** A price the open fields send as 0 while it is unknown. */
function knownPrice(ticks: bigint, priceScale: number): string | undefined {
    return ticks > 0n ? scaledToDecimalOutput(ticks, priceScale) : undefined;
}

const MarketOverviewRawSchema = v.object({
    symbolId: v.number(),
    lastPriceTicks: v.bigint(),
    lastTradeTsNs: v.optional(v.bigint(), 0n),
    change24hBps: v.number(),
    high24hTicks: v.bigint(),
    low24hTicks: v.bigint(),
    open24hTicks: v.optional(v.bigint(), 0n),
    tradeCount24h: v.optional(v.bigint(), 0n),
    vwap24hTicks: v.optional(v.bigint()),
    openUtcDayTicks: v.optional(v.bigint(), 0n),
    stats1h: v.optional(RollingWindowStatsRawSchema),
    stats4h: v.optional(RollingWindowStatsRawSchema),
    stats7d: v.optional(RollingWindowStatsRawSchema),
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
    priceBand: v.optional(v.custom<ProtoLivePriceBand>((value) => typeof value === "object")),
});

export function createMarketOverviewSchema(scales: SdkScales) {
    return v.pipe(
        MarketOverviewRawSchema,
        v.transform((m) => {
            const priceScale = scales.price();
            const baseQtyScale = scales.baseQty(m.symbolId);
            const quoteAmountScale = scales.quoteAmount(m.symbolId);
            const volumeScale = scales.marketDataVolume(m.symbolId);
            return {
                symbolId: m.symbolId,
                lastPrice: scaledToDecimalOutput(m.lastPriceTicks, priceScale),
                lastTradeTsMs: tsNsToMs(m.lastTradeTsNs),
                /**
                 * Change from `open24h` to the last price in basis points; 0 and meaningless while
                 * `open24h` is unknown.
                 */
                change24hBps: m.change24hBps,
                /** Highest price in the rolling 24h window, counting its open and every trade. */
                high24h: scaledToDecimalOutput(m.high24hTicks, priceScale),
                /** Lowest price in the rolling 24h window, counting its open and every trade. */
                low24h: scaledToDecimalOutput(m.low24hTicks, priceScale),
                /**
                 * The 24h open `change24hBps` is measured from; undefined while unknown: no trade
                 * yet, a first trade only seconds old, or trade history briefly unavailable.
                 */
                open24h: knownPrice(m.open24hTicks, priceScale),
                /** Trades executed in the rolling 24h window, as a decimal string. */
                tradeCount24h: m.tradeCount24h.toString(),
                /**
                 * 24h volume-weighted average trade price, rounded down; undefined when the window
                 * has no base volume. It cannot be reproduced from the displayed volumes.
                 */
                vwap24h:
                    m.vwap24hTicks === undefined
                        ? undefined
                        : scaledToDecimalOutput(m.vwap24hTicks, priceScale),
                /**
                 * Price at 00:00 UTC today; undefined while unknown, including for a few seconds
                 * after midnight. Change since the day open is `lastPrice` against it.
                 */
                openUtcDay: knownPrice(m.openUtcDayTicks, priceScale),
                /** Rolling 1h stats; undefined while the window's open is unknown. */
                stats1h: formatRollingWindowStats(m.stats1h, priceScale),
                /** Rolling 4h stats; undefined while the window's open is unknown. */
                stats4h: formatRollingWindowStats(m.stats4h, priceScale),
                /** Rolling 7-day stats; undefined while the window's open is unknown. */
                stats7d: formatRollingWindowStats(m.stats7d, priceScale),
                volume24hBase:
                    m.volume24hBaseScaled === undefined
                        ? undefined
                        : scaledToDecimalOutput(m.volume24hBaseScaled, volumeScale),
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
                /**
                 * The pair's live price band while one was confirmed in the last 5 seconds; absent
                 * means no fresh band is known. Treat it as unknown once `validUntilMs` passes, and
                 * check order prices with `marketData.getPriceBand` instead.
                 */
                priceBand: m.priceBand ? formatLivePriceBand(scales, m.priceBand) : undefined,
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

/** Inclusive bounds as decimal strings; an omitted bound leaves that side open. */
function decimalRangeInputSchema(field: string, scale: number) {
    const bound = (side: "min" | "max") =>
        v.optional(
            v.pipe(
                v.string(),
                v.transform((value) => decimalInputToScaled(`${field}.${side}`, value, scale)),
                v.maxValue(
                    PROTOBUF_INT64_MAX,
                    `${field}.${side} exceeds the maximum supported value`,
                ),
            ),
        );
    return v.optional(v.strictObject({ min: bound("min"), max: bound("max") }));
}

const Int32InputSchema = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(-Number(PROTOBUF_INT32_MAX) - 1),
    v.maxValue(Number(PROTOBUF_INT32_MAX)),
);

export const ListMarketOverviewInputSchema = v.pipe(
    v.strictObject({
        symbolIds: v.optional(v.array(SymbolIdInputSchema), []),
        limit: v.optional(PositiveUint32InputSchema, 500),
        /**
         * Previous `nextPageToken`; reuse only with the same symbol IDs, range filters and sort.
         * Any other reuse throws `ValidationError`: request the first page again.
         */
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
        /**
         * Only markets whose `lastPrice` is within these bounds, in quote units with at most 9
         * decimals. With a bound set, a market with no trade yet never matches.
         */
        lastPrice: decimalRangeInputSchema("lastPrice", PRICE_SCALE),
        /**
         * Only markets whose signed `change24hBps` is within these bounds. With a bound set, a
         * market whose 24h open is unknown never matches. Sorting by `change_24h_bps` still uses
         * the absolute change.
         */
        change24hBps: v.optional(
            v.strictObject({
                min: v.optional(Int32InputSchema),
                max: v.optional(Int32InputSchema),
            }),
        ),
        /**
         * Only markets whose `volume24hUsd` is within these bounds, in USD with at most 6
         * decimals. With a bound set, a market without a USD volume never matches.
         */
        volume24hUsd: decimalRangeInputSchema("volume24hUsd", 6),
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
    v.transform(({ symbolIds, lastPrice, change24hBps, volume24hUsd, ...input }) => ({
        symbolId: symbolIds,
        ...input,
        lastPrice: lastPrice && { minTicks: lastPrice.min, maxTicks: lastPrice.max },
        change24h: change24hBps && { minBps: change24hBps.min, maxBps: change24hBps.max },
        volume24h: volume24hUsd && {
            minUsdScaled: volume24hUsd.min,
            maxUsdScaled: volume24hUsd.max,
        },
    })),
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
