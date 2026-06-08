import type { SpotConfig } from "../services/market-data/index.js";
import type { DepositWithdrawConfig } from "../services/zipper/index.js";
import {
    buildMarketCatalogData,
    setAssetCatalog,
    setEnrichedPairCatalog,
} from "./market-data-catalog.js";
import {
    buildZipperCatalogData,
    setZipperAssetsCatalog,
    setZipperChainsCatalog,
    setZipperContractsCatalog,
} from "./zipper-catalog.js";

type CatalogRefreshClient = {
    catalog?: {
        refresh(): Promise<unknown>;
    };
    marketData?: {
        getSpotConfig(): Promise<SpotConfig>;
    };
    zipper?: {
        getDepositWithdrawConfig(): Promise<DepositWithdrawConfig>;
    };
};

let legacyRefresh: Promise<void> | undefined;

/**
 * Refreshes the client-owned catalog store.
 */
export async function refreshCatalogs(client: CatalogRefreshClient): Promise<void> {
    if (client.catalog) {
        await client.catalog.refresh();
        return;
    }
    if (!client.marketData || !client.zipper) {
        throw new Error(
            "catalog refresh requires a client catalog or market/zipper config services",
        );
    }

    legacyRefresh ??= Promise.all([
        client.marketData.getSpotConfig(),
        client.zipper.getDepositWithdrawConfig(),
    ])
        .then(([market, zipper]) => {
            const marketData = buildMarketCatalogData(market);
            const zipperData = buildZipperCatalogData(zipper);
            setAssetCatalog(marketData.assets);
            setEnrichedPairCatalog(marketData.pairs);
            setZipperChainsCatalog(zipperData.chains);
            setZipperAssetsCatalog(zipperData.assets);
            setZipperContractsCatalog(zipperData.contracts);
        })
        .finally(() => {
            legacyRefresh = undefined;
        });

    await legacyRefresh;
}

/**
 * Starts a non-blocking catalog refresh and reports any refresh failures.
 */
export function refreshCatalogsInBackground(client: CatalogRefreshClient): void {
    refreshCatalogs(client).catch(() => {});
}

/**
 * Refreshes catalog data through the client-owned catalog store.
 */
export async function refreshZipperCatalogFromApi(client: CatalogRefreshClient): Promise<void> {
    await refreshCatalogs(client);
}
