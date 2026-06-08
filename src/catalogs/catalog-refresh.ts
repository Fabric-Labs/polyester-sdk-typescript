import type { SpotConfig } from "../services/market-data/index.js";
import type { DepositWithdrawConfig } from "../services/zipper/index.js";
import { hydrateCatalog } from "./market-data-catalog.js";
import { hydrateZipperCatalog } from "./zipper-catalog.js";

type CatalogRefreshClient = {
    marketData: {
        getSpotConfig(): Promise<SpotConfig>;
    };
    zipper: {
        getDepositWithdrawConfig(): Promise<DepositWithdrawConfig>;
    };
};

let marketCatalogRefresh: Promise<void> | undefined;
let zipperCatalogRefresh: Promise<void> | undefined;

function refreshMarketCatalog(client: CatalogRefreshClient): Promise<void> {
    marketCatalogRefresh ??= client.marketData
        .getSpotConfig()
        .then(hydrateCatalog)
        .finally(() => {
            marketCatalogRefresh = undefined;
        });

    return marketCatalogRefresh;
}

function refreshZipperCatalog(client: CatalogRefreshClient): Promise<void> {
    zipperCatalogRefresh ??= client.zipper
        .getDepositWithdrawConfig()
        .then(hydrateZipperCatalog)
        .finally(() => {
            zipperCatalogRefresh = undefined;
        });

    return zipperCatalogRefresh;
}

export async function refreshCatalogs(client: CatalogRefreshClient): Promise<void> {
    await Promise.all([refreshMarketCatalog(client), refreshZipperCatalog(client)]);
}

export function refreshCatalogsInBackground(client: CatalogRefreshClient): void {
    refreshCatalogs(client).catch(() => {});
}

export async function refreshZipperCatalogFromApi(client: CatalogRefreshClient): Promise<void> {
    await refreshZipperCatalog(client);
}
