import { z } from "zod";
import { SideSchema } from "../shared.js";
import { assetForId } from "../../../../catalogs/ledger-catalog.js";
import { formatPriceForSymbol, formatQtyForSymbol } from "../../../../catalogs/orders-catalog.js";
import {
    getPair,
    getPairBySymbolId,
    symbolForSymbolId,
    baseAssetIdForSymbolId,
    quoteAssetIdForSymbolId,
    type EnrichedPairConfig,
} from "../../../../catalogs/market-data-catalog.js";
import { tsNsToMs } from "../../utils/time.js";
import { timestampToMs } from "../../utils/timestamp.js";
import { SideFilterCodec } from "./market-data.codecs.js";

interface SymbolMetadata {
    id: number;
    label: string;
    baseAssetId: number;
    quoteAssetId: number;
    baseAsset: AssetConfig;
    quoteAsset: AssetConfig;
    pair?: EnrichedPairConfig;
}

function symbolMetadataForId(symbolId: number): SymbolMetadata {
    const pair = getPairBySymbolId(symbolId);
    const baseAssetId = baseAssetIdForSymbolId(symbolId);
    const quoteAssetId = quoteAssetIdForSymbolId(symbolId);
    return {
        id: symbolId,
        label: symbolForSymbolId(symbolId),
        baseAssetId,
        quoteAssetId,
        baseAsset: assetForId(baseAssetId),
        quoteAsset: assetForId(quoteAssetId),
        pair,
    };
}

export const MarketTradeSchema = z
    .object({
        symbolId: z.number(),
        matchId: z.bigint(),
        isBuy: z.boolean(),
        priceTicks: z.bigint(),
        qtyScaled: z.bigint(),
        tsNs: z.bigint().optional().default(0n),
    })
    .transform((t) => {
        const sideLabel: z.output<typeof SideSchema> = t.isBuy ? "buy" : "sell";
        return {
            ...t,
            symbol: symbolMetadataForId(t.symbolId),
            symbolLabel: symbolForSymbolId(t.symbolId),
            sideLabel,
            qtyDisplay: formatQtyForSymbol(t.qtyScaled, t.symbolId),
            priceDisplay: formatPriceForSymbol(t.priceTicks, t.symbolId),
            tsMs: tsNsToMs(t.tsNs),
        };
    });

export type MarketTrade = z.output<typeof MarketTradeSchema>;

export const GetMarketTradesInputSchema = z
    .object({
        symbol: z.string().trim().min(1),
        side: SideSchema.optional(),
        startTsNs: z
            .string()
            .trim()
            .optional()
            .transform((v) => (v ? BigInt(v) : undefined)),
        endTsNs: z
            .string()
            .trim()
            .optional()
            .transform((v) => (v ? BigInt(v) : undefined)),
        limit: z
            .string()
            .trim()
            .optional()
            .default("")
            .transform((v) => {
                if (!v) return undefined;
                const lim = Number(v);
                return Number.isFinite(lim) && lim > 0 ? lim : undefined;
            }),
    })
    .transform((input) => {
        const pair = getPair(input.symbol);
        if (!pair) throw new Error(`Unknown symbol: ${input.symbol}`);
        return {
            symbolId: pair.symbolId,
            side: input.side ? SideFilterCodec.inputToProto[input.side] : undefined,
            startTsNs: input.startTsNs,
            endTsNs: input.endTsNs,
            limit: input.limit,
        };
    });

export type GetMarketTradesInput = z.input<typeof GetMarketTradesInputSchema>;
export type GetMarketTradesRequest = z.output<typeof GetMarketTradesInputSchema>;

export const AssetConfigSchema = z
    .object({
        /**
         * Asset identifier/symbol, e.g. 'USDT', 'BTC'.
         */
        asset: z.string(),
        /**
         * Internal ledger identifier for settlement systems.
         */
        ledgerId: z.number(),
        /**
         * The friendly display name for the asset (e.g. 'Bitcoin').
         */
        name: z.string(),
        /**
         * UI-only display precision for asset amounts/balances.
         */
        quantityDisplayDecimals: z.number(),
        /**
         * Fixed integer scaling for quantities/amounts in this asset (0..18).
         */
        quantityScale: z.number(),
    })
    .transform((a) => ({
        symbol: a.asset,
        ledgerId: a.ledgerId,
        name: a.name,
        quantityDisplayDecimals: a.quantityDisplayDecimals,
        quantityScale: a.quantityScale,
    }));

export type AssetConfig = z.output<typeof AssetConfigSchema>;

export const PairMarketDataConfigSchema = z
    .object({
        /**
         * Available price grouping sizes for the orderbook in quote units.
         * Allows viewing orders bucketed by larger increments (e.g., [0.01, 0.1, 1, 10]).
         */
        orderbookPriceBuckets: z.array(z.number()),
    })
    .default({
        orderbookPriceBuckets: [] as number[],
    });

function bpsToPercent(bps: number): number {
    return bps / 100;
}

export const PairConfigSchema = z
    .object({
        /**
         * Internal engine symbol id for the pair.
         */
        symbolId: z.number(),
        /**
         * Pair symbol string, e.g. 'BTC-USDT'
         */
        symbol: z.string(),
        /**
         * Base asset symbol, e.g. 'BTC'
         */
        baseAsset: z.string(),
        /**
         * Quote asset symbol, e.g. 'USDT'
         */
        quoteAsset: z.string(),
        /**
         * (e.g., "0.01") - The smallest price increment allowed. If tick size is 0.01, you can price at $100.00, $100.01, $100.02... but NOT $100.005.
         */
        tickSize: z.string(),
        /**
         * (e.g., "0.0001") - The smallest quantity increment allowed. If step size is 0.0001, you can order 100.0000, 100.0001, 100.0002... but NOT 100.00005.
         */
        stepSize: z.string(),
        /**
         * (e.g., "1") - Minimum order value in quote currency. If it's "1" and quote is USD, your order must be worth at least $1. So you can't buy $0.50 worth of something.
         */
        minNotionalQuote: z.string(),
        /**
         * Minimum quantity you can order in base currency terms. If it's "0.001" for BTC, smallest order is 0.001 BTC.
         */
        minQtyBase: z.string(),

        /**
         * Controls whether trading fee can be deducted from what you receive when buying.
         * Example
         * - You buy 1 ETH, fee is 0.1%
         * - if `true`, you receive 0.999 ETH (fee taken from ETH you're getting)
         * - if `false`, you receive 1 ETH, but you pay the fee separately in the quote currency (e.g., extra USDT)
         */
        allowBuyFeeFromReceived: z.boolean(),
        /**
         * Default market slippage for buy orders in basis points from proto.
         */
        defaultMarketSlippageBpsBuy: z.number().default(0),
        /**
         * Default market slippage for sell orders in basis points from proto.
         */
        defaultMarketSlippageBpsSell: z.number().default(0),
        /**
         * Maximum server/client reference-price drift in basis points from proto.
         */
        maxClientRefDriftBps: z.number().default(0),

        /**
         * Market-data configuration for this pair (orderbook bucket sizes, depths).
         */
        marketdata: PairMarketDataConfigSchema.optional(),
        /**
         * Base asset quantity scale copied from AssetConfig.quantityScale.
         */
        baseQuantityScale: z.number(),
        /**
         * Quote asset quantity scale copied from AssetConfig.quantityScale.
         */
        quoteQuantityScale: z.number(),
        /**
         * Optional scheduled listing timestamp (UTC).
         */
        listingAt: z.unknown().optional().transform(timestampToMs),
        /**
         * Optional scheduled delisting timestamp (UTC).
         */
        delistingAt: z.unknown().optional().transform(timestampToMs),
        /**
         * Operational status of the pair.
         */
        status: z
            .string()
            .transform(
                (v): PairStatus =>
                    (PAIR_STATUSES as readonly string[]).includes(v)
                        ? (v as PairStatus)
                        : "unknown",
            ),
    })
    .transform(
        ({
            defaultMarketSlippageBpsBuy,
            defaultMarketSlippageBpsSell,
            maxClientRefDriftBps,
            ...pair
        }) => ({
            ...pair,
            defaultMarketSlippagePctBuy: bpsToPercent(defaultMarketSlippageBpsBuy),
            defaultMarketSlippagePctSell: bpsToPercent(defaultMarketSlippageBpsSell),
            maxClientRefDriftPct: bpsToPercent(maxClientRefDriftBps),
        }),
    );

export type PairStatus =
    | "enabled"
    | "disabled"
    | "cancel_only"
    | "post_only"
    | "reduce_only"
    | "unknown";

export const PAIR_STATUSES = [
    "enabled",
    "disabled",
    "cancel_only",
    "post_only",
    "reduce_only",
] as const satisfies readonly PairStatus[];

export type PairConfig = z.output<typeof PairConfigSchema>;

export const SpotConfigSchema = z.object({
    assets: z.array(AssetConfigSchema),
    pairs: z.array(PairConfigSchema),
    tsSec: z.bigint().transform((v) => Number(v) * 1000),
});

export type SpotConfig = z.output<typeof SpotConfigSchema>;
