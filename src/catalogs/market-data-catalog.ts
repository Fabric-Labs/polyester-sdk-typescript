import type {
    AssetConfig,
    PairConfig,
    PairStatus,
    SpotConfig,
} from "../services/market-data/market-data.schemas.js";
import { isDev } from "../utils/is-dev.js";

export type PairMarketDataConfig = {
    orderbookPriceBuckets: number[];
};

/**
 * Enriched pair config where baseAsset/quoteAsset are full AssetConfig objects
 * instead of just string identifiers.
 */
export interface EnrichedPairConfig {
    symbolId: number;
    symbol: string;
    baseAsset: AssetConfig;
    quoteAsset: AssetConfig;
    tickSize: string;
    stepSize: string;
    minNotionalQuote: string;
    minQtyBase: string;
    allowBuyFeeFromReceived: boolean;
    defaultMarketSlippagePctBuy: number;
    defaultMarketSlippagePctSell: number;
    maxClientRefDriftPct: number;
    marketdata?: PairMarketDataConfig;
    listingAt: number | null;
    delistingAt: number | null;
    status: PairStatus;
}

// module-level catalog storage
let ASSET_CATALOG = new Map<string, AssetConfig>();
let ASSET_BY_LEDGER_ID = new Map<number, AssetConfig>();
let PAIR_CATALOG = new Map<string, EnrichedPairConfig>();
let PAIR_BY_ID = new Map<number, EnrichedPairConfig>();

/**
 * Populates the asset catalog from an array of AssetConfig.
 */
export function setAssetCatalog(assets: AssetConfig[]): void {
    const bySymbol = new Map<string, AssetConfig>();
    const byLedgerId = new Map<number, AssetConfig>();

    for (const asset of assets) {
        bySymbol.set(asset.symbol, asset);
        byLedgerId.set(asset.ledgerId, asset);
    }

    ASSET_CATALOG = bySymbol;
    ASSET_BY_LEDGER_ID = byLedgerId;
}

/**
 * Populates the pair catalog from already-enriched pairs.
 */
export function setEnrichedPairCatalog(pairs: EnrichedPairConfig[]): void {
    const bySymbol = new Map<string, EnrichedPairConfig>();
    const byId = new Map<number, EnrichedPairConfig>();

    for (const pair of pairs) {
        bySymbol.set(pair.symbol, pair);
        byId.set(pair.symbolId, pair);
    }

    PAIR_CATALOG = bySymbol;
    PAIR_BY_ID = byId;
}

/**
 * Populates the pair catalog, enriching each pair with full asset references.
 * Requires assets to be set first (or passed explicitly).
 */
function setPairCatalog(pairs: PairConfig[], assets?: AssetConfig[]): void {
    // use passed assets or fall back to current catalog
    const assetMap = assets ? new Map(assets.map((a) => [a.symbol, a])) : ASSET_CATALOG;

    const bySymbol = new Map<string, EnrichedPairConfig>();
    const byId = new Map<number, EnrichedPairConfig>();

    for (const pair of pairs) {
        const baseAsset = assetMap.get(pair.baseAsset);
        const quoteAsset = assetMap.get(pair.quoteAsset);

        if (!baseAsset || !quoteAsset) {
            if (isDev()) {
                console.warn(
                    `[market-data-catalog] Missing asset for pair ${pair.symbol}: base=${pair.baseAsset}, quote=${pair.quoteAsset}`,
                );
            }
            continue;
        }

        const enriched: EnrichedPairConfig = {
            symbolId: pair.symbolId,
            symbol: pair.symbol,
            baseAsset,
            quoteAsset,
            tickSize: pair.tickSize,
            stepSize: pair.stepSize,
            minNotionalQuote: pair.minNotionalQuote,
            minQtyBase: pair.minQtyBase,
            allowBuyFeeFromReceived: pair.allowBuyFeeFromReceived,
            defaultMarketSlippagePctBuy: pair.defaultMarketSlippagePctBuy,
            defaultMarketSlippagePctSell: pair.defaultMarketSlippagePctSell,
            maxClientRefDriftPct: pair.maxClientRefDriftPct,
            marketdata: pair.marketdata,
            listingAt: pair.listingAt ?? null,
            delistingAt: pair.delistingAt ?? null,
            status: pair.status,
        };

        bySymbol.set(pair.symbol, enriched);
        byId.set(pair.symbolId, enriched);
    }

    PAIR_CATALOG = bySymbol;
    PAIR_BY_ID = byId;
}

/**
 * Hydrates both asset and pair catalogs from a SpotConfig response.
 */
export function hydrateCatalog(spotConfig: SpotConfig): void {
    setAssetCatalog(spotConfig.assets);
    setPairCatalog(spotConfig.pairs, spotConfig.assets);
}

// asset getters

/**
 * Returns market-data asset metadata by asset symbol.
 */
export function getAsset(symbol: string): AssetConfig | undefined {
    return ASSET_CATALOG.get(symbol);
}

/**
 * Returns market-data asset metadata by ledger asset id.
 */
export function getAssetByLedgerId(ledgerId: number): AssetConfig | undefined {
    return ASSET_BY_LEDGER_ID.get(ledgerId);
}

/**
 * Returns every asset in the market-data catalog.
 */
export function getAllAssets(): AssetConfig[] {
    return Array.from(ASSET_CATALOG.values());
}

// pair getters

/**
 * Returns market pair metadata by pair symbol.
 */
export function getPair(symbol: string): EnrichedPairConfig {
    const pair = PAIR_CATALOG.get(symbol);
    if (!pair) {
        throw new Error(`[market-data-catalog] Unknown pair symbol: ${symbol}`);
    }
    return pair;
}

/**
 * Resolves a symbol string to symbolId. Returns undefined if not found.
 */
export function symbolIdForSymbol(symbol: string): number | undefined {
    return PAIR_CATALOG.get(symbol)?.symbolId;
}

/**
 * Returns market pair metadata by numeric symbol id.
 */
export function getPairBySymbolId(symbolId: number): EnrichedPairConfig {
    const pair = PAIR_BY_ID.get(symbolId);
    if (!pair) {
        throw new Error(`[market-data-catalog] Unknown pair symbolId: ${symbolId}`);
    }
    return pair;
}

/**
 * Returns every market pair known to the catalog.
 */
export function getAllPairs(): EnrichedPairConfig[] {
    return Array.from(PAIR_CATALOG.values());
}

/**
 * Returns all market pairs that have ever been listed.
 */
export function getAllPairsEverListed(): EnrichedPairConfig[] {
    return Array.from(PAIR_CATALOG.values()).filter(
        (pair) => pair.listingAt !== null && pair.listingAt < Date.now(),
    );
}

/**
 * Returns market pairs that are currently listed.
 */
export function getAllListedPairs(): EnrichedPairConfig[] {
    return Array.from(PAIR_CATALOG.values()).filter((pair) => {
        if (pair.listingAt === null) return false;
        if (pair.listingAt > Date.now()) return false;
        if (pair.status === "disabled") return false;
        if (pair.delistingAt !== null && pair.delistingAt < Date.now()) return false;
        return true;
    });
}

// convenience helpers for backward compatibility

/**
 * Returns the pair symbol for a numeric symbol id.
 */
export function symbolForSymbolId(symbolId: number): string {
    return PAIR_BY_ID.get(symbolId)?.symbol ?? String(symbolId);
}

/**
 * Returns the base asset metadata for a numeric symbol id.
 */
export function baseAssetForSymbolId(symbolId: number): AssetConfig {
    return getPairBySymbolId(symbolId).baseAsset;
}

/**
 * Returns the quote asset metadata for a numeric symbol id.
 */
export function quoteAssetForSymbolId(symbolId: number): AssetConfig {
    return getPairBySymbolId(symbolId).quoteAsset;
}

/**
 * Returns the base quantity scale for a market symbol.
 */
export function baseQuantityScaleForSymbol(symbol: string): number {
    return PAIR_CATALOG.get(symbol)?.baseAsset.quantityScale ?? 18;
}

/**
 * Returns the ledger id for the base asset of a symbol.
 * Falls back to 0 if symbol not found.
 */
export function baseAssetIdForSymbolId(symbolId: number): number {
    return PAIR_BY_ID.get(symbolId)?.baseAsset.ledgerId ?? 0;
}

/**
 * Returns the ledger id for the quote asset of a symbol.
 * Falls back to 0 if symbol not found.
 */
export function quoteAssetIdForSymbolId(symbolId: number): number {
    return PAIR_BY_ID.get(symbolId)?.quoteAsset.ledgerId ?? 0;
}

/**
 * Returns the default market-order slippage percentage for a symbol.
 */
export function defaultMarketSlippagePctForSymbol(
    symbol: string,
    side: "buy" | "sell",
): number | undefined {
    const pair = PAIR_CATALOG.get(symbol);
    if (!pair) return undefined;
    return side === "buy" ? pair.defaultMarketSlippagePctBuy : pair.defaultMarketSlippagePctSell;
}
