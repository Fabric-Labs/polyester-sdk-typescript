import * as Proto from "../../gen/marketoverview/v1/marketoverview_pb.js";
import { z } from "zod";
import { intToDecimalString, int6ToDecimalString } from "../../catalogs/orders-catalog.js";
import { assetForSymbol } from "../../catalogs/ledger-catalog.js";
import { tsNsToMs } from "../../utils/time.js";
import { getPairBySymbolId } from "../../catalogs/market-data-catalog.js";
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

export const SparklineIntervalSchema = z.enum(SPARKLINE_INTERVAL_VALUES);

export type SparklineIntervalName = z.output<typeof SparklineIntervalSchema>;

function sparklineIntervalNameFor(value: Proto.SparklineInterval): SparklineIntervalName {
	if (value === Proto.SparklineInterval.SPARKLINE_INTERVAL_UNSPECIFIED) {
		throw new Error("[MarketOverviewSparklineSchema]: interval is required");
	}
	const name = SparklineIntervalCodec.protoToOutput[value];
	if (!name) {
		throw new Error(`[MarketOverviewSparklineSchema]: invalid interval ${value}`);
	}
	return name;
}

export const MarketOverviewSparklineSchema = z.object({
	interval: z.enum(Proto.SparklineInterval).transform((v) => sparklineIntervalNameFor(v)),
	closeTicks: z.array(z.bigint()),
});

export type MarketOverviewSparkline = {
	interval: SparklineIntervalName;
	prices: number[];
};

export const MarketOverviewOrderBySchema = z.enum(MARKET_OVERVIEW_ORDER_BY_VALUES);

export type MarketOverviewOrderBy = z.output<typeof MarketOverviewOrderBySchema>;

export const MarketOverviewSortSchema = z.enum(MARKET_OVERVIEW_SORT_VALUES);

export type MarketOverviewSort = z.output<typeof MarketOverviewSortSchema>;

export const MarketOverviewSchema = z
	.object({
		symbolId: z.number(),
		symbol: z.string(),
		lastPriceTicks: z.bigint(),
		lastTradeTsNs: z.bigint().optional().default(0n),
		change24hBp: z.number(),
		high24hTicks: z.bigint(),
		low24hTicks: z.bigint(),
		volume24hBaseScaled: z.bigint(),
		volume24hQuoteScaled: z.bigint(),
		listedTsNs: z.bigint().optional().default(0n),
		bestBidTicks: z.bigint(),
		bestBidQtyScaled: z.bigint(),
		bestAskTicks: z.bigint(),
		bestAskQtyScaled: z.bigint(),
		sparklines: z.array(MarketOverviewSparklineSchema).optional().default([]),
	})
	.transform((m) => {
		const [baseAsset = "", quoteAsset = ""] = m.symbol.split("-");
		const base = assetForSymbol(baseAsset);
		const baseScale = base.quantityScale;
		const pair = getPairBySymbolId(m.symbolId);

		return {
			symbolId: m.symbolId,
			pair: m.symbol,
			pairListingAt: pair.listingAt ?? null,
			pairDelistingAt: pair.delistingAt ?? null,
			status: pair.status,
			symbol: {
				base,
				quote: assetForSymbol(quoteAsset),
			},
			lastPrice: parseInt(int6ToDecimalString(m.lastPriceTicks)),
			lastTradeTsMs: tsNsToMs(m.lastTradeTsNs),
			change24hBp: m.change24hBp,
			high24h: parseInt(int6ToDecimalString(m.high24hTicks)),
			low24h: parseInt(int6ToDecimalString(m.low24hTicks)),
			volume24hBase: parseInt(intToDecimalString(m.volume24hBaseScaled, baseScale)),
			volume24hQuote: parseInt(int6ToDecimalString(m.volume24hQuoteScaled)),
			listedTsMs: tsNsToMs(m.listedTsNs),
			bestBid: parseInt(int6ToDecimalString(m.bestBidTicks)),
			bestBidQty: intToDecimalString(m.bestBidQtyScaled, baseScale),
			bestAsk: parseInt(int6ToDecimalString(m.bestAskTicks)),
			bestAskQty: parseInt(intToDecimalString(m.bestAskQtyScaled, baseScale)),
			sparklines: m.sparklines.map((s) => ({
				interval: s.interval,

				prices: s.closeTicks.map((t) => parseInt(int6ToDecimalString(t))).reverse(),
			})),
		};
	});

export type MarketOverview = z.output<typeof MarketOverviewSchema>;

const MS_PER_24H = 86_400_000;

function change24hBpFromSparklineFirstLast(sparklines: MarketOverview["sparklines"]): number {
	const s = sparklines.find((e) => e.interval === "24h") ?? sparklines[0];
	if (!s || s.prices.length < 2) return 0;
	const first = s.prices[0] ?? 0;
	const last = s.prices.at(-1) ?? 0;
	if (first === 0) return 0;
	return Math.round(((last - first) / first) * 10_000);
}

export function getMarketOverview24hChangeDisplay(
	market: Pick<MarketOverview, "change24hBp" | "listedTsMs" | "sparklines">,
	nowMs: number = Date.now()
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

export const ListMarketOverviewInputSchema = z.object({
	symbols: z.array(z.string().trim().min(1)).optional().default([]),
	limit: z.int().positive().optional().default(500),
	page: z.int().positive().optional().default(1),
	orderBy: MarketOverviewOrderBySchema.optional()
		.default("volume_24h_quote")
		.transform((v) => MarketOverviewOrderByCodec.inputToProto[v]),
	sort: MarketOverviewSortSchema.optional()
		.default("desc")
		.transform((v) => MarketOverviewSortCodec.inputToProto[v]),
	includeSparklines: z.boolean().optional().default(true),
	sparklineIntervals: z
		.array(SparklineIntervalSchema)
		.optional()
		.default(["24h"])
		.transform((intervals) => intervals.map((v) => SparklineIntervalCodec.inputToProto[v])),
});

export type ListMarketOverviewInput = z.input<typeof ListMarketOverviewInputSchema>;
