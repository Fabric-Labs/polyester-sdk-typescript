import type {
    AssetConfig,
    PairConfig,
    PairStatus,
    SpotConfig,
} from "../services/market-data/market-data.schemas.js";

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

export interface MarketCatalogData {
    readonly assets: readonly AssetConfig[];
    readonly pairs: readonly EnrichedPairConfig[];
    readonly tsSec?: number;
}

export type MarketCatalogSeed =
    | SpotConfig
    | {
          readonly assets: readonly AssetConfig[];
          readonly pairs: readonly (PairConfig | EnrichedPairConfig)[];
          readonly tsSec?: number;
      };

function isEnrichedPair(pair: PairConfig | EnrichedPairConfig): pair is EnrichedPairConfig {
    return typeof pair.baseAsset === "object" && typeof pair.quoteAsset === "object";
}

export function enrichMarketPairs(
    pairs: readonly (PairConfig | EnrichedPairConfig)[],
    assets: readonly AssetConfig[],
): readonly EnrichedPairConfig[] {
    const assetBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));
    const enrichedPairs: EnrichedPairConfig[] = [];

    for (const pair of pairs) {
        if (isEnrichedPair(pair)) {
            enrichedPairs.push(pair);
            continue;
        }

        const baseAsset = assetBySymbol.get(pair.baseAsset);
        const quoteAsset = assetBySymbol.get(pair.quoteAsset);
        if (!baseAsset || !quoteAsset) {
            throw new Error(
                `[catalog] market pair ${pair.symbol} references unknown asset: base=${pair.baseAsset}, quote=${pair.quoteAsset}`,
            );
        }

        enrichedPairs.push({
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
        });
    }

    return enrichedPairs;
}

export function buildMarketCatalogData(seed: MarketCatalogSeed): MarketCatalogData {
    const assets = [...seed.assets];
    const pairs = enrichMarketPairs(seed.pairs, assets);
    return Object.freeze({
        assets: Object.freeze(assets),
        pairs: Object.freeze([...pairs]),
        tsSec: seed.tsSec,
    });
}

let legacyAssetBySymbol = new Map<string, AssetConfig>();
let legacyAssetByLedgerId = new Map<number, AssetConfig>();
let legacyPairBySymbol = new Map<string, EnrichedPairConfig>();
let legacyPairBySymbolId = new Map<number, EnrichedPairConfig>();
let legacyMarketCatalogListener:
    | ((market: { assets: readonly AssetConfig[]; pairs: readonly EnrichedPairConfig[] }) => void)
    | undefined;

export function setLegacyMarketCatalogListener(
    listener: (market: {
        assets: readonly AssetConfig[];
        pairs: readonly EnrichedPairConfig[];
    }) => void,
): void {
    legacyMarketCatalogListener = listener;
}

function notifyLegacyMarketCatalogListener(): void {
    legacyMarketCatalogListener?.({
        assets: getAllAssets(),
        pairs: getAllPairs(),
    });
}

export function setAssetCatalog(assets: readonly AssetConfig[]): void {
    legacyAssetBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));
    legacyAssetByLedgerId = new Map(assets.map((asset) => [asset.ledgerId, asset]));
    notifyLegacyMarketCatalogListener();
}

export function setEnrichedPairCatalog(pairs: readonly EnrichedPairConfig[]): void {
    legacyPairBySymbol = new Map(pairs.map((pair) => [pair.symbol, pair]));
    legacyPairBySymbolId = new Map(pairs.map((pair) => [pair.symbolId, pair]));
    notifyLegacyMarketCatalogListener();
}

export function getAsset(symbol: string): AssetConfig | undefined {
    return legacyAssetBySymbol.get(symbol);
}

export function getAssetByLedgerId(ledgerId: number): AssetConfig | undefined {
    return legacyAssetByLedgerId.get(ledgerId);
}

export function getAllAssets(): AssetConfig[] {
    return Array.from(legacyAssetBySymbol.values());
}

export function getPair(symbol: string): EnrichedPairConfig {
    const pair = legacyPairBySymbol.get(symbol);
    if (!pair) throw new Error(`[market-data-catalog] Unknown pair symbol: ${symbol}`);
    return pair;
}

export function getPairBySymbolId(symbolId: number): EnrichedPairConfig {
    const pair = legacyPairBySymbolId.get(symbolId);
    if (!pair) throw new Error(`[market-data-catalog] Unknown pair symbolId: ${symbolId}`);
    return pair;
}

export function getAllPairs(): EnrichedPairConfig[] {
    return Array.from(legacyPairBySymbol.values());
}

export function symbolIdForSymbol(symbol: string): number | undefined {
    return legacyPairBySymbol.get(symbol)?.symbolId;
}

export function symbolForSymbolId(symbolId: number): string {
    return getPairBySymbolId(symbolId).symbol;
}
