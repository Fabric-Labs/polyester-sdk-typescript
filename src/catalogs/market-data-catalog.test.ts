import { beforeAll, describe, expect, it } from "vitest";
import { isKnownAssetId } from "./ledger-catalog.js";
import {
    getAsset,
    getAssetByLedgerId,
    getPair,
    getPairBySymbolId,
    setAssetCatalog,
    setEnrichedPairCatalog,
    symbolIdForSymbol,
} from "./market-data-catalog.js";
import { ASSET_CATALOG, PAIR_CATALOG } from "./market-data-catalog.generated.js";

describe("market data catalog", () => {
    beforeAll(() => {
        setAssetCatalog(ASSET_CATALOG);
        setEnrichedPairCatalog(PAIR_CATALOG);
    });

    it("returns undefined for unknown asset lookups", () => {
        expect(getAsset("NOT_REAL")).toBeUndefined();
        expect(getAssetByLedgerId(999_999)).toBeUndefined();
        expect(isKnownAssetId(999_999)).toBe(false);
    });

    it("throws for unknown pair lookups", () => {
        expect(() => getPair("NOT_REAL-USDT")).toThrow(
            "[market-data-catalog] Unknown pair symbol: NOT_REAL-USDT",
        );
        expect(() => getPairBySymbolId(999_999)).toThrow(
            "[market-data-catalog] Unknown pair symbolId: 999999",
        );
        expect(symbolIdForSymbol("NOT_REAL-USDT")).toBeUndefined();
    });
});
