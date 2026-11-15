import { describe, expect, it } from "vitest";
import { createTestCatalog } from "../testing/catalog.js";
import { createCatalogSdkScales } from "../shared/decimal-surface.js";
import { CatalogLookupError } from "./types.js";
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

    it("fails closed when a decimal conversion asks for an unknown asset scale", () => {
        const catalog = createTestCatalog({ assets: [] });
        const scales = createCatalogSdkScales(() => catalog);

        expect(() => scales.ledgerAmount(404)).toThrow(CatalogLookupError);
    });

    it("never decodes an unknown ledger id at an invented scale", () => {
        const catalog = createTestCatalog({
            assets: [
                {
                    symbol: "ETH",
                    ledgerId: 18,
                    name: "Ether",
                    quantityDisplayDecimals: 6,
                    quantityScale: 18,
                },
            ],
        });
        const scaled = "1500000000000000000";

        expect(catalog.ledger.amountScaledToDecimalString(scaled, 18)).toBe("1.5");
        expect(() => catalog.ledger.amountScaledToDecimalString(scaled, 31337)).toThrow(
            "ledger ledgerId not found: 31337",
        );
        expect(() => catalog.ledger.amountScaledToDisplayString(scaled, 31337)).toThrow(
            CatalogLookupError,
        );
        expect(() => catalog.ledger.decimalAmountToScaled("1.5", 31337)).toThrow(
            CatalogLookupError,
        );
        expect(() => catalog.ledger.normalizeAmountInput("1.5", 31337)).toThrow(CatalogLookupError);
        expect(() => catalog.ledger.formatAmount("1.5", 31337)).toThrow(CatalogLookupError);
        // The display fallback keeps amounts unscaled if a caller applies its scale.
        expect(catalog.ledger.getAssetByLedgerId(31337).quantityScale).toBe(0);
        expect(catalog.zipper.getAssetByLedgerId(31337).quantityScale).toBe(0);
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
