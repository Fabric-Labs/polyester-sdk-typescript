import { describe, expect, it } from "vitest";
import { createTestCatalog } from "../testing/catalog.js";
import {
    resolveLedgerAssetByLedgerId,
    resolveZipperAssetByLedgerId,
    UNKNOWN_ASSET_LABEL,
    UNKNOWN_LEDGER_ASSET_ID,
    unknownLedgerAsset,
} from "./unknown-asset.js";

describe("unknown asset catalog lookups", () => {
    it("resolveLedgerAssetByLedgerId returns unknown asset for proto-zero ids", () => {
        expect(
            resolveLedgerAssetByLedgerId(0, () => ({
                symbol: "BTC",
                ledgerId: 1,
                name: "Bitcoin",
                quantityDisplayDecimals: 8,
                quantityScale: 8,
            })),
        ).toEqual(unknownLedgerAsset);
    });

    it("market.getAssetByLedgerId returns unknown asset for missing ids", () => {
        const catalog = createTestCatalog({ assets: [] });

        expect(catalog.market.getAssetByLedgerId(404)).toMatchObject({
            symbol: UNKNOWN_ASSET_LABEL,
            ledgerId: UNKNOWN_LEDGER_ASSET_ID,
        });
    });

    it("market.requireAssetByLedgerId no longer throws for proto-zero ids", () => {
        const catalog = createTestCatalog({ assets: [] });

        expect(catalog.market.requireAssetByLedgerId(0)).toMatchObject({
            symbol: UNKNOWN_ASSET_LABEL,
            name: UNKNOWN_ASSET_LABEL,
        });
    });

    it("ledger.isKnownAssetId treats unknown fallback ids as unresolved", () => {
        const catalog = createTestCatalog({ assets: [] });

        expect(catalog.ledger.isKnownAssetId(0)).toBe(false);
        expect(catalog.ledger.isKnownAssetId(UNKNOWN_LEDGER_ASSET_ID)).toBe(false);
        expect(catalog.ledger.isKnownAssetId(404)).toBe(false);
    });

    it("zipper.getAssetByLedgerId returns unknown asset for missing ids", () => {
        const catalog = createTestCatalog({ assets: [] });

        expect(catalog.zipper.getAssetByLedgerId(404)).toMatchObject({
            asset: UNKNOWN_ASSET_LABEL,
            ledgerId: UNKNOWN_LEDGER_ASSET_ID,
        });
    });

    it("resolveZipperAssetByLedgerId returns unknown asset for proto-zero ids", () => {
        expect(
            resolveZipperAssetByLedgerId(0, () => ({
                asset: "BTC",
                ledgerId: 1,
                name: "Bitcoin",
                icon: "btc",
                quantityScale: 8,
                quantityDisplayDecimals: 8,
                uAssetId: "0xabc",
                chains: [],
            })),
        ).toMatchObject({
            asset: UNKNOWN_ASSET_LABEL,
            ledgerId: UNKNOWN_LEDGER_ASSET_ID,
        });
    });
});
