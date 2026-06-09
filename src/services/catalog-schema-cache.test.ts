import { describe, expect, it } from "vitest";
import type { CatalogReader, CatalogSnapshot } from "../catalogs/index.js";
import { createTestCatalog } from "../testing/catalog.js";
import { createCatalogSchemaCache } from "./catalog-schema-cache.js";

type MutableCatalogSnapshot = Omit<CatalogSnapshot, "version"> & {
    version: number;
};

describe("createCatalogSchemaCache", () => {
    it("reuses schemas for the same snapshot and rebuilds for a new snapshot object", () => {
        const firstSnapshot = createTestCatalog().snapshot();
        const secondSnapshot = createTestCatalog().snapshot();
        let currentSnapshot: CatalogSnapshot = firstSnapshot;
        let builds = 0;
        const catalog = {
            ...createTestCatalog(),
            snapshot: () => currentSnapshot,
        } satisfies CatalogReader;

        const schemas = createCatalogSchemaCache(catalog, (reader) => ({
            build: ++builds,
            snapshot: reader.snapshot(),
        }));

        const first = schemas.current();
        const reused = schemas.current();
        currentSnapshot = secondSnapshot;
        const rebuilt = schemas.current();

        expect(reused).toBe(first);
        expect(first.snapshot).toBe(firstSnapshot);
        expect(rebuilt).not.toBe(first);
        expect(rebuilt.snapshot).toBe(secondSnapshot);
        expect(builds).toBe(2);
    });

    it("rebuilds schemas when the same snapshot object advances version", () => {
        const currentSnapshot: MutableCatalogSnapshot = {
            ...createTestCatalog().snapshot(),
        };
        let builds = 0;
        const catalog = {
            ...createTestCatalog(),
            snapshot: () => currentSnapshot,
        } satisfies CatalogReader;

        const schemas = createCatalogSchemaCache(catalog, (reader) => ({
            build: ++builds,
            snapshot: reader.snapshot(),
            version: reader.snapshot().version,
        }));

        const first = schemas.current();
        const reused = schemas.current();
        currentSnapshot.version += 1;
        const rebuilt = schemas.current();

        expect(reused).toBe(first);
        expect(rebuilt).not.toBe(first);
        expect(rebuilt.snapshot).toBe(currentSnapshot);
        expect(rebuilt.version).toBe(2);
        expect(builds).toBe(2);
    });
});
