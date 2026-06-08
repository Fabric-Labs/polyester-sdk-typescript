type CatalogRefreshClient = {
    catalog: {
        refresh(): Promise<unknown>;
    };
};

/**
 * Refreshes the client-owned catalog store.
 */
export async function refreshCatalogs(client: CatalogRefreshClient): Promise<void> {
    await client.catalog.refresh();
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
