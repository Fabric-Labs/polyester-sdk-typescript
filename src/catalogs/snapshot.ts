import { ASSET_CATALOG, PAIR_CATALOG } from "./market-data-catalog.generated.js";
import { buildMarketCatalogData, type MarketCatalogSeed } from "./market-data-catalog.js";
import type { CatalogSnapshot, CreatePolyesterCatalogOptions } from "./types.js";
import {
    ZIPPER_ASSET_CATALOG,
    ZIPPER_CHAIN_CATALOG,
    ZIPPER_CONTRACTS_CATALOG,
} from "./zipper-catalog.generated.js";
import { buildZipperCatalogData, type ZipperCatalogSeed } from "./zipper-catalog.js";

export type CompleteCatalogSeed = {
    readonly market: MarketCatalogSeed;
    readonly zipper: ZipperCatalogSeed;
};

export const generatedSeed = {
    market: {
        assets: ASSET_CATALOG,
        pairs: PAIR_CATALOG,
    },
    zipper: {
        chains: ZIPPER_CHAIN_CATALOG,
        assets: ZIPPER_ASSET_CATALOG,
        contracts: ZIPPER_CONTRACTS_CATALOG,
    },
} satisfies CompleteCatalogSeed;

export function buildCatalogSnapshot(params: {
    seed: CompleteCatalogSeed;
    source: CatalogSnapshot["source"];
    version: number;
    loadedAtMs?: number;
}): CatalogSnapshot {
    return Object.freeze({
        source: params.source,
        loadedAtMs: params.loadedAtMs ?? Date.now(),
        version: params.version,
        market: buildMarketCatalogData(params.seed.market),
        zipper: buildZipperCatalogData(params.seed.zipper),
    });
}

export function buildGeneratedCatalogSnapshot(): CatalogSnapshot {
    return buildCatalogSnapshot({
        seed: generatedSeed,
        source: "generated",
        version: 1,
    });
}

export function buildCustomCatalogSnapshot(
    seed: NonNullable<CreatePolyesterCatalogOptions["seed"]>,
): CatalogSnapshot {
    return buildCatalogSnapshot({
        seed: {
            market: seed.market ?? generatedSeed.market,
            zipper: seed.zipper ?? generatedSeed.zipper,
        },
        source: "custom",
        version: 1,
    });
}
