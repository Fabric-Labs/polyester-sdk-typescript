import type { CatalogSnapshot } from "./types.js";

export type ZippedAssetSupplyCatalogUpdate = {
    zippedAssetId: number;
    supply: string;
};

export function patchZipperCatalogSupply(
    snapshot: CatalogSnapshot,
    updates: readonly ZippedAssetSupplyCatalogUpdate[],
): CatalogSnapshot {
    if (updates.length === 0) return snapshot;

    const supplyByZippedAssetId = new Map<number, string>();
    for (const update of updates) {
        supplyByZippedAssetId.set(update.zippedAssetId, update.supply);
    }

    let changed = false;
    const assets = snapshot.zipper.assets.map((asset) => {
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

    if (!changed) return snapshot;
    const nowMs = Date.now();

    return {
        ...snapshot,
        tsMs: nowMs,
        version: snapshot.version + 1,
        zipper: {
            ...snapshot.zipper,
            tsMs: nowMs,
            assets,
        },
    };
}
