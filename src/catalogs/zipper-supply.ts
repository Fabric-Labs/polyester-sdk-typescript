import type { CatalogSnapshot } from "./types.js";
import {
    markCatalogSnapshotParsed,
    parseCatalogSnapshot,
    parseZippedAssetSupplyCatalogUpdates,
} from "./snapshot-validation.js";

export type ZippedAssetSupplyCatalogUpdate = {
    zippedAssetId: number;
    supply: string;
    status?: "available" | "stale";
    observedAt?: number;
};

export function patchZipperCatalogSupply(
    snapshot: CatalogSnapshot,
    updates: readonly ZippedAssetSupplyCatalogUpdate[],
): CatalogSnapshot {
    const parsedSnapshot = parseCatalogSnapshot(snapshot);
    const parsedUpdates = parseZippedAssetSupplyCatalogUpdates(updates);
    if (parsedUpdates.length === 0) return parsedSnapshot;

    const updateByZippedAssetId = new Map<number, ZippedAssetSupplyCatalogUpdate>();
    for (const update of parsedUpdates) {
        updateByZippedAssetId.set(update.zippedAssetId, update);
    }

    let changed = false;
    const assets = parsedSnapshot.zipper.assets.map((asset) => {
        let assetChanged = false;
        const chains = asset.chains.map((chain) => {
            const update = updateByZippedAssetId.get(chain.zippedAssetId);
            if (
                update === undefined ||
                (update.supply === chain.supply &&
                    (update.status ?? chain.supplyStatus) === chain.supplyStatus &&
                    (update.observedAt ?? chain.supplyObservedAt) === chain.supplyObservedAt)
            ) {
                return chain;
            }
            assetChanged = true;
            changed = true;
            return {
                ...chain,
                supply: update.supply,
                ...(update.status !== undefined && { supplyStatus: update.status }),
                ...(update.observedAt !== undefined && { supplyObservedAt: update.observedAt }),
            };
        });

        return assetChanged ? { ...asset, chains } : asset;
    });

    if (!changed) return parsedSnapshot;
    const nowMs = Date.now();

    return markCatalogSnapshotParsed({
        ...parsedSnapshot,
        tsMs: nowMs,
        version: parsedSnapshot.version + 1,
        zipper: {
            ...parsedSnapshot.zipper,
            tsMs: nowMs,
            assets,
        },
    });
}
