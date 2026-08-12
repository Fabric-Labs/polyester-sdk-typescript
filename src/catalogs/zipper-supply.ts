import type { CatalogSnapshot } from "./types.js";
import {
    parseCatalogSnapshot,
    parseZippedAssetSupplyCatalogUpdates,
} from "./snapshot-validation.js";

export type ZippedAssetSupplyCatalogUpdate = {
    zippedAssetId: number;
    supply: string;
};

export function patchZipperCatalogSupply(
    snapshot: CatalogSnapshot,
    updates: readonly ZippedAssetSupplyCatalogUpdate[],
): CatalogSnapshot {
    const parsedSnapshot = parseCatalogSnapshot(snapshot);
    const parsedUpdates = parseZippedAssetSupplyCatalogUpdates(updates);
    if (parsedUpdates.length === 0) return parsedSnapshot;

    const supplyByZippedAssetId = new Map<number, string>();
    for (const update of parsedUpdates) {
        supplyByZippedAssetId.set(update.zippedAssetId, update.supply);
    }

    let changed = false;
    const assets = parsedSnapshot.zipper.assets.map((asset) => {
        let assetChanged = false;
        const chains = asset.chains.map((chain) => {
            const supply = supplyByZippedAssetId.get(chain.zippedAssetId);
            if (supply === undefined || supply === chain.supply) return chain;
            assetChanged = true;
            changed = true;
            return { ...chain, supply };
        });

        return assetChanged ? { ...asset, chains } : asset;
    });

    if (!changed) return parsedSnapshot;
    const nowMs = Date.now();

    return {
        ...parsedSnapshot,
        tsMs: nowMs,
        version: parsedSnapshot.version + 1,
        zipper: {
            ...parsedSnapshot.zipper,
            tsMs: nowMs,
            assets,
        },
    };
}
