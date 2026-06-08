import type { AssetConfig, ZipperChainConfig, ZipperChainContractConfig } from "./config-types.js";
import type { EnrichedPairConfig } from "./market-data-catalog.js";
import type { CatalogSnapshot } from "./types.js";
import type { ZipperEnrichedAssetConfig } from "./zipper-catalog.js";

export interface CatalogIndexes {
    readonly assetBySymbol: Map<string, AssetConfig>;
    readonly assetByLedgerId: Map<number, AssetConfig>;
    readonly pairBySymbol: Map<string, EnrichedPairConfig>;
    readonly pairBySymbolId: Map<number, EnrichedPairConfig>;
    readonly zipperChainByCode: Map<string, ZipperChainConfig>;
    readonly zipperChainById: Map<number, ZipperChainConfig>;
    readonly zipperAssetBySymbol: Map<string, ZipperEnrichedAssetConfig>;
    readonly zipperAssetByLedgerId: Map<number, ZipperEnrichedAssetConfig>;
    readonly zipperContractByName: Map<string, ZipperChainContractConfig>;
}

const indexesBySnapshot = new WeakMap<CatalogSnapshot, CatalogIndexes>();

export function indexesFor(snapshot: CatalogSnapshot): CatalogIndexes {
    const existing = indexesBySnapshot.get(snapshot);
    if (existing) return existing;

    const indexes: CatalogIndexes = {
        assetBySymbol: new Map(snapshot.market.assets.map((asset) => [asset.symbol, asset])),
        assetByLedgerId: new Map(snapshot.market.assets.map((asset) => [asset.ledgerId, asset])),
        pairBySymbol: new Map(snapshot.market.pairs.map((pair) => [pair.symbol, pair])),
        pairBySymbolId: new Map(snapshot.market.pairs.map((pair) => [pair.symbolId, pair])),
        zipperChainByCode: new Map(snapshot.zipper.chains.map((chain) => [chain.code, chain])),
        zipperChainById: new Map(snapshot.zipper.chains.map((chain) => [chain.chainId, chain])),
        zipperAssetBySymbol: new Map(snapshot.zipper.assets.map((asset) => [asset.asset, asset])),
        zipperAssetByLedgerId: new Map(
            snapshot.zipper.assets.map((asset) => [asset.ledgerId, asset]),
        ),
        zipperContractByName: new Map(
            snapshot.zipper.contracts.map((contract) => [contract.name, contract]),
        ),
    };
    indexesBySnapshot.set(snapshot, indexes);
    return indexes;
}
