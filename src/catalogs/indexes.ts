import type {
    AssetConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
} from "../shared/catalog-config.js";
import type { EnrichedPairConfig } from "./market-data-catalog.js";
import type { CatalogSnapshot, ZipperAssetChainRoute } from "./types.js";
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
    readonly zipperAssetByUAssetId: Map<string, ZipperEnrichedAssetConfig>;
    readonly zipperRouteByZippedAssetId: Map<number, ZipperAssetChainRoute>;
    readonly zipperContractByName: Map<string, ZipperChainContractConfig>;
}

type CatalogIndexCacheEntry = {
    readonly version: number;
    readonly indexes: CatalogIndexes;
};

const indexesBySnapshot = new WeakMap<CatalogSnapshot, CatalogIndexCacheEntry>();

function buildZipperRoutesByZippedAssetId(
    assets: readonly ZipperEnrichedAssetConfig[],
): Map<number, ZipperAssetChainRoute> {
    const routes = new Map<number, ZipperAssetChainRoute>();
    for (const asset of assets) {
        for (const chain of asset.chains) {
            routes.set(chain.zippedAssetId, { asset, chain });
        }
    }
    return routes;
}

export function indexesFor(snapshot: CatalogSnapshot): CatalogIndexes {
    const existing = indexesBySnapshot.get(snapshot);
    if (existing?.version === snapshot.version) return existing.indexes;

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
        zipperAssetByUAssetId: new Map(
            snapshot.zipper.assets
                .filter((asset) => asset.uAssetId !== "")
                .map((asset) => [asset.uAssetId, asset]),
        ),
        zipperRouteByZippedAssetId: buildZipperRoutesByZippedAssetId(snapshot.zipper.assets),
        zipperContractByName: new Map(
            snapshot.zipper.contracts.map((contract) => [contract.name, contract]),
        ),
    };
    indexesBySnapshot.set(snapshot, { version: snapshot.version, indexes });
    return indexes;
}
