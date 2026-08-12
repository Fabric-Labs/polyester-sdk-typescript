import { buildMarketCatalogData, type MarketCatalogSeed } from "./market-data-catalog.js";
import type { CatalogSnapshot } from "./types.js";
import { buildZipperCatalogData, type ZipperCatalogSeed } from "./zipper-catalog.js";
import { ValidationError } from "../shared/errors.js";
import { parseCatalogSnapshot } from "./snapshot-validation.js";

export type CatalogSnapshotInput = {
    readonly market: MarketCatalogSeed;
    readonly zipper: ZipperCatalogSeed;
};

export function buildCatalogSnapshot(params: {
    market: MarketCatalogSeed;
    zipper: ZipperCatalogSeed;
    source?: CatalogSnapshot["source"];
    version?: number;
    tsMs?: number;
}): CatalogSnapshot {
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
        throw new ValidationError("Catalog snapshot input must be an object.");
    }
    if (
        typeof params.market !== "object" ||
        params.market === null ||
        !Array.isArray(params.market.assets) ||
        !Array.isArray(params.market.pairs) ||
        typeof params.zipper !== "object" ||
        params.zipper === null ||
        !Array.isArray(params.zipper.chains) ||
        !Array.isArray(params.zipper.assets)
    ) {
        throw new ValidationError("Catalog snapshot input requires valid market and zipper seeds.");
    }

    try {
        return parseCatalogSnapshot(
            Object.freeze({
                source: params.source ?? "snapshot",
                tsMs: params.tsMs ?? Date.now(),
                version: params.version ?? 1,
                market: buildMarketCatalogData(params.market),
                zipper: buildZipperCatalogData(params.zipper),
            }),
        );
    } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new ValidationError("Catalog snapshot input is malformed.", { cause: error });
    }
}
