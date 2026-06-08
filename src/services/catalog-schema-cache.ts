import {
    createCatalogSnapshotReader,
    type CatalogReader,
    type CatalogSnapshot,
} from "../catalogs/index.js";

export interface CatalogSchemaCache<T> {
    current(): T;
}

export function createCatalogSchemaCache<T>(
    catalog: CatalogReader,
    build: (reader: CatalogReader) => T,
): CatalogSchemaCache<T> {
    let cachedSnapshot: CatalogSnapshot | undefined;
    let cachedSchemas: T | undefined;

    return {
        current(): T {
            const snapshot = catalog.snapshot();
            if (!cachedSchemas || cachedSnapshot !== snapshot) {
                cachedSnapshot = snapshot;
                cachedSchemas = build(createCatalogSnapshotReader(snapshot));
            }
            return cachedSchemas;
        },
    };
}
