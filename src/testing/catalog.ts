import {
    createPolyesterCatalog,
    type ClientCatalog,
    type EnrichedPairConfig,
    type ZipperCatalogSeed,
} from "../catalogs/index.js";
import type { AssetConfig, PairConfig } from "../catalogs/config-types.js";

type TestCatalogOptions = {
    assets?: readonly AssetConfig[];
    pairs?: readonly (PairConfig | EnrichedPairConfig)[];
    zipper?: ZipperCatalogSeed;
};

function isEnrichedPair(pair: PairConfig | EnrichedPairConfig): pair is EnrichedPairConfig {
    return typeof pair.baseAsset === "object" && typeof pair.quoteAsset === "object";
}

function uniqueAssets(
    assets: readonly AssetConfig[],
    pairs: readonly (PairConfig | EnrichedPairConfig)[],
): readonly AssetConfig[] {
    const bySymbol = new Map<string, AssetConfig>();
    for (const asset of assets) bySymbol.set(asset.symbol, asset);
    for (const pair of pairs) {
        if (!isEnrichedPair(pair)) continue;
        bySymbol.set(pair.baseAsset.symbol, pair.baseAsset);
        bySymbol.set(pair.quoteAsset.symbol, pair.quoteAsset);
    }
    return Array.from(bySymbol.values());
}

export function createTestCatalog(options: TestCatalogOptions = {}): ClientCatalog {
    const pairs = options.pairs ?? [];
    return createPolyesterCatalog({
        seed: {
            market: {
                assets: uniqueAssets(options.assets ?? [], pairs),
                pairs,
            },
            zipper: options.zipper,
        },
        refresh: false,
    });
}
