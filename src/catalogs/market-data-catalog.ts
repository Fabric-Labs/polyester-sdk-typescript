import type { AssetConfig, PairConfig, SpotConfig } from "../shared/catalog-config.js";

export type { PairMarketDataConfig } from "../shared/catalog-config.js";

/**
 * Enriched pair config where baseAsset/quoteAsset are full AssetConfig objects
 * instead of just string identifiers.
 */
export interface EnrichedPairConfig extends Omit<
    PairConfig,
    | "baseAsset"
    | "quoteAsset"
    | "listingAt"
    | "delistingAt"
    | "baseQuantityScale"
    | "quoteQuantityScale"
> {
    /** Optional only for snapshots created before quantity scales were retained. */
    baseQuantityScale?: PairConfig["baseQuantityScale"];
    quoteQuantityScale?: PairConfig["quoteQuantityScale"];
    baseAsset: AssetConfig;
    quoteAsset: AssetConfig;
    listingAt: number | null;
    delistingAt: number | null;
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
            ...pair,
            baseAsset,
            quoteAsset,
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
