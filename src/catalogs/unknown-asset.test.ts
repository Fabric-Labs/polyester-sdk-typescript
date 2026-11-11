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

    it("ledger amount helpers fail closed instead of decoding an unknown asset at scale 6", () => {
        const catalog = createTestCatalog({ assets: [] });
        const amount = 1_500_000_000_000_000_000n;
        const helpers = [
            () => catalog.ledger.amountScaledToDecimalString(amount, 31337),
            () => catalog.ledger.amountScaledToDisplayString(amount, { ledgerId: 31337 }),
            () => catalog.ledger.decimalAmountToScaled("1.5", 31337),
            () => catalog.ledger.normalizeAmountInput("1.5", 31337),
            () => catalog.ledger.formatAmount("1.5", 31337),
        ];

        for (const helper of helpers) {
            expect(helper).toThrow(new CatalogLookupError("ledger", "ledgerId", 31337));
        }
    });

    it("ledger amount helpers still decode a known scale-18 asset", () => {
        const catalog = createTestCatalog({
            assets: [
                {
                    symbol: "ETH",
                    ledgerId: 31337,
                    name: "Ether",
                    quantityDisplayDecimals: 6,
                    quantityScale: 18,
                },
            ],
        });

        expect(catalog.ledger.amountScaledToDecimalString(1_500_000_000_000_000_000n, 31337)).toBe(
            "1.5",
        );
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
