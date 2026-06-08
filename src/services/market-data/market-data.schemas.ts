import * as v from "valibot";
import { SideSchema } from "../shared.js";
import {
    createCatalogSnapshotReader,
    PAIR_STATUSES,
    type AssetConfig,
    type CatalogReader,
    type CatalogSnapshot,
    type EnrichedPairConfig,
    type PairConfig,
    type PairMarketDataConfig,
    type PairStatus,
    type SpotConfig,
} from "../../catalogs/index.js";
import { createCatalogSchemaCache } from "../catalog-schema-cache.js";
import { tsNsToMs } from "../../utils/time.js";
import { timestampToMs, tsNsToTimestamp } from "../../utils/timestamp.js";
import { SideFilterCodec } from "./market-data.codecs.js";

export type { AssetConfig, PairConfig, PairMarketDataConfig, PairStatus, SpotConfig };
export { PAIR_STATUSES };

interface SymbolMetadata {
    id: number;
    label: string;
    baseAssetId: number;
    quoteAssetId: number;
    baseAsset: AssetConfig;
    quoteAsset: AssetConfig;
    pair?: EnrichedPairConfig;
}

function symbolMetadataForId(reader: CatalogReader, symbolId: number): SymbolMetadata {
    const pair = reader.market.requirePairBySymbolId(symbolId);
    const baseAssetId = pair.baseAsset.ledgerId;
    const quoteAssetId = pair.quoteAsset.ledgerId;
    return {
        id: symbolId,
        label: pair.symbol,
        baseAssetId,
        quoteAssetId,
        baseAsset: pair.baseAsset,
        quoteAsset: pair.quoteAsset,
        pair,
    };
}

export function createMarketTradeSchema(catalog: CatalogSnapshot) {
    return createMarketTradeSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createMarketTradeSchemaForReader(reader: CatalogReader) {
    return v.pipe(
        v.object({
            symbolId: v.number(),
            matchId: v.bigint(),
            isBuy: v.boolean(),
            priceTicks: v.bigint(),
            qtyScaled: v.bigint(),
            tsNs: v.optional(v.bigint(), 0n),
        }),
        v.transform((t) => {
            const sideLabel: v.InferOutput<typeof SideSchema> = t.isBuy ? "buy" : "sell";
            const pair = reader.market.requirePairBySymbolId(t.symbolId);
            return {
                ...t,
                symbol: symbolMetadataForId(reader, t.symbolId),
                symbolLabel: pair.symbol,
                sideLabel,
                qtyDisplay: reader.orders.formatQuantity(t.qtyScaled, t.symbolId),
                priceDisplay: reader.orders.formatPrice(t.priceTicks, t.symbolId),
                tsMs: tsNsToMs(t.tsNs),
            };
        }),
    );
}

export type MarketTrade = v.InferOutput<ReturnType<typeof createMarketTradeSchema>>;

export function createGetMarketTradesInputSchema(catalog: CatalogSnapshot) {
    return createGetMarketTradesInputSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createGetMarketTradesInputSchemaForReader(reader: CatalogReader) {
    return v.pipe(
        v.object({
            symbol: v.pipe(v.string(), v.trim(), v.minLength(1)),
            side: v.optional(SideSchema),
            startTsNs: v.pipe(
                v.optional(v.pipe(v.string(), v.trim())),
                v.transform((v) => (v ? BigInt(v) : undefined)),
            ),
            endTsNs: v.pipe(
                v.optional(v.pipe(v.string(), v.trim())),
                v.transform((v) => (v ? BigInt(v) : undefined)),
            ),
            limit: v.pipe(
                v.optional(v.pipe(v.string(), v.trim()), ""),
                v.transform((v) => {
                    if (!v) return undefined;
                    const lim = Number(v);
                    return Number.isFinite(lim) && lim > 0 ? lim : undefined;
                }),
            ),
        }),
        v.transform((input) => {
            const pair = reader.market.requirePairBySymbol(input.symbol);
            return {
                symbolId: pair.symbolId,
                side: input.side ? SideFilterCodec.inputToProto[input.side] : undefined,
                startTime: tsNsToTimestamp(input.startTsNs),
                endTime: tsNsToTimestamp(input.endTsNs),
                limit: input.limit,
            };
        }),
    );
}

export type GetMarketTradesInput = v.InferInput<
    ReturnType<typeof createGetMarketTradesInputSchema>
>;
export type GetMarketTradesRequest = v.InferOutput<
    ReturnType<typeof createGetMarketTradesInputSchema>
>;

export function createMarketDataSchemas(catalog: CatalogReader) {
    return createCatalogSchemaCache(catalog, (reader) => ({
        marketTrade: createMarketTradeSchemaForReader(reader),
        getMarketTradesInput: createGetMarketTradesInputSchemaForReader(reader),
    }));
}

export const AssetConfigSchema = v.pipe(
    v.object({
        /**
         * Asset identifier/symbol, e.g. 'USDT', 'BTC'.
         */
        asset: v.string(),
        /**
         * Internal ledger identifier for settlement systems.
         */
        ledgerId: v.number(),
        /**
         * The friendly display name for the asset (e.g. 'Bitcoin').
         */
        name: v.string(),
        /**
         * UI-only display precision for asset amounts/balances.
         */
        quantityDisplayDecimals: v.number(),
        /**
         * Fixed integer scaling for quantities/amounts in this asset (0..18).
         */
        quantityScale: v.number(),
    }),
    v.transform((a) => ({
        symbol: a.asset,
        ledgerId: a.ledgerId,
        name: a.name,
        quantityDisplayDecimals: a.quantityDisplayDecimals,
        quantityScale: a.quantityScale,
    })),
);

export const PairMarketDataConfigSchema = v.optional(
    v.object({
        /**
         * Available price grouping sizes for the orderbook in quote units.
         * Allows viewing orders bucketed by larger increments (e.g., [0.01, 0.1, 1, 10]).
         */
        orderbookPriceBuckets: v.array(v.number()),
    }),
    {
        orderbookPriceBuckets: [] as number[],
    },
);

function bpsToPercent(bps: number): number {
    return bps / 100;
}

export const PairConfigSchema = v.pipe(
    v.object({
        /**
         * Internal engine symbol id for the pair.
         */
        symbolId: v.number(),
        /**
         * Pair symbol string, e.g. 'BTC-USDT'
         */
        symbol: v.string(),
        /**
         * Base asset symbol, e.g. 'BTC'
         */
        baseAsset: v.string(),
        /**
         * Quote asset symbol, e.g. 'USDT'
         */
        quoteAsset: v.string(),
        /**
         * (e.g., "0.01") - The smallest price increment allowed. If tick size is 0.01, you can price at $100.00, $100.01, $100.02... but NOT $100.005.
         */
        tickSize: v.string(),
        /**
         * (e.g., "0.0001") - The smallest quantity increment allowed. If step size is 0.0001, you can order 100.0000, 100.0001, 100.0002... but NOT 100.00005.
         */
        stepSize: v.string(),
        /**
         * (e.g., "1") - Minimum order value in quote currency. If it's "1" and quote is USD, your order must be worth at least $1. So you can't buy $0.50 worth of something.
         */
        minNotionalQuote: v.string(),
        /**
         * Minimum quantity you can order in base currency terms. If it's "0.001" for BTC, smallest order is 0.001 BTC.
         */
        minQtyBase: v.string(),

        /**
         * Controls whether trading fee can be deducted from what you receive when buying.
         * Example
         * - You buy 1 ETH, fee is 0.1%
         * - if `true`, you receive 0.999 ETH (fee taken from ETH you're getting)
         * - if `false`, you receive 1 ETH, but you pay the fee separately in the quote currency (e.g., extra USDT)
         */
        allowBuyFeeFromReceived: v.boolean(),
        /**
         * Default market slippage for buy orders in basis points from proto.
         */
        defaultMarketSlippageBpsBuy: v.optional(v.number(), 0),
        /**
         * Default market slippage for sell orders in basis points from proto.
         */
        defaultMarketSlippageBpsSell: v.optional(v.number(), 0),
        /**
         * Maximum server/client reference-price drift in basis points from proto.
         */
        maxClientRefDriftBps: v.optional(v.number(), 0),

        /**
         * Market-data configuration for this pair (orderbook bucket sizes, depths).
         */
        marketdata: v.optional(PairMarketDataConfigSchema),
        /**
         * Base asset quantity scale copied from AssetConfig.quantityScale.
         */
        baseQuantityScale: v.number(),
        /**
         * Quote asset quantity scale copied from AssetConfig.quantityScale.
         */
        quoteQuantityScale: v.number(),
        /**
         * Optional scheduled listing timestamp (UTC).
         */
        listingAt: v.pipe(v.optional(v.unknown()), v.transform(timestampToMs)),
        /**
         * Optional scheduled delisting timestamp (UTC).
         */
        delistingAt: v.pipe(v.optional(v.unknown()), v.transform(timestampToMs)),
        /**
         * Operational status of the pair.
         */
        status: v.pipe(
            v.string(),
            v.transform(
                (v): PairStatus =>
                    (PAIR_STATUSES as readonly string[]).includes(v)
                        ? (v as PairStatus)
                        : "unknown",
            ),
        ),
    }),
    v.transform(
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
    ),
);

export const SpotConfigSchema = v.object({
    assets: v.array(AssetConfigSchema),
    pairs: v.array(PairConfigSchema),
    tsSec: v.pipe(
        v.bigint(),
        v.transform((v) => Number(v) * 1000),
    ),
});
