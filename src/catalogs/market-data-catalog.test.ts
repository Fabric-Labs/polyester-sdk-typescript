import { describe, expect, it } from "vitest";
import { ASSET_CATALOG, PAIR_CATALOG } from "./market-data-catalog.generated.js";
import { createTestCatalog } from "../testing/catalog.js";

describe("market data catalog", () => {
    const catalog = createTestCatalog({ assets: ASSET_CATALOG, pairs: PAIR_CATALOG });

    it("returns null for unknown asset lookups", () => {
        expect(catalog.market.getAssetBySymbol("NOT_REAL")).toBeNull();
        expect(catalog.market.getAssetByLedgerId(999_999)).toBeNull();
        expect(catalog.ledger.isKnownAssetId(999_999)).toBe(false);
    });

    it("throws for unknown pair lookups", () => {
        expect(() => catalog.market.requirePairBySymbol("NOT_REAL-USDT")).toThrow(
            "[catalog] market pairSymbol not found: NOT_REAL-USDT",
        );
        expect(() => catalog.market.requirePairBySymbolId(999_999)).toThrow(
            "[catalog] market symbolId not found: 999999",
        );
        expect(catalog.market.getSymbolIdByPairSymbol("NOT_REAL-USDT")).toBeNull();
    });
});
