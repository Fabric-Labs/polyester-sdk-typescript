import { describe, expect, it } from "vitest";
import type { CatalogReader, CatalogSnapshot } from "../catalogs/index.js";
import { createTestCatalog } from "../testing/catalog.js";
import { createCatalogSchemaCache } from "./catalog-schema-cache.js";

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
});
