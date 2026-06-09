import { buildMarketCatalogData, type MarketCatalogSeed } from "./market-data-catalog.js";
import type { CatalogSnapshot } from "./types.js";
import { buildZipperCatalogData, type ZipperCatalogSeed } from "./zipper-catalog.js";

export type CatalogSnapshotInput = {
    readonly market: MarketCatalogSeed;
    readonly zipper: ZipperCatalogSeed;
};

export function buildCatalogSnapshot(params: {
    market: MarketCatalogSeed;
    zipper: ZipperCatalogSeed;
    source?: CatalogSnapshot["source"];
    version?: number;
    loadedAtMs?: number;
}): CatalogSnapshot {
    return Object.freeze({
        source: params.source ?? "snapshot",
        loadedAtMs: params.loadedAtMs ?? Date.now(),
        version: params.version ?? 1,
        market: buildMarketCatalogData(params.market),
        zipper: buildZipperCatalogData(params.zipper),
    });
}
