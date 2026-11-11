import { describe, expect, it } from "vitest";
import { createTestCatalog } from "../testing/catalog.js";
import { createCatalogSdkScales } from "../shared/decimal-surface.js";
import type { AssetConfig } from "../shared/catalog-config.js";
import type { ZipperCatalogSeed } from "./zipper-catalog.js";
import { CatalogLookupError } from "./types.js";
import { UNKNOWN_LEDGER_ASSET_ID } from "./unknown-asset.js";

const BTC: AssetConfig = {
    symbol: "BTC",
    ledgerId: 1,
    name: "Bitcoin",
    quantityDisplayDecimals: 5,
    quantityScale: 8,
};

const ZIPPER: ZipperCatalogSeed = {
    chains: [],
    assets: [
        {
            asset: "BTC",
            ledgerId: 1,
            name: "Bitcoin",
            icon: "btc",
            quantityScale: 8,
            quantityDisplayDecimals: 5,
            uAssetId: "0xaaaa",
            variants: [],
        },
    ],
    contracts: [],
    tsMs: 0,
};

const MISSING_IDS = [404, 0, UNKNOWN_LEDGER_ASSET_ID];

function catalog() {
    return createTestCatalog({ assets: [BTC], zipper: ZIPPER });
}

describe("ledger asset id lookups", () => {
    it("return the catalog entry for a known id on every reader", () => {
        const { market, ledger, zipper } = catalog();

        expect(market.getAssetByLedgerId(1)).toEqual(BTC);
        expect(market.requireAssetByLedgerId(1)).toEqual(BTC);
        expect(ledger.getAssetByLedgerId(1)).toEqual(BTC);
        expect(ledger.requireAssetByLedgerId(1)).toEqual(BTC);
        expect(ledger.requireSymbolByLedgerId(1)).toBe("BTC");
        expect(ledger.isKnownAssetId(1)).toBe(true);
        expect(zipper.getAssetByLedgerId(1)).toMatchObject({ asset: "BTC", quantityScale: 8 });
        expect(zipper.requireAssetByLedgerId(1)).toMatchObject({ asset: "BTC" });
    });

    it("get* returns null for a missing, proto-default or sentinel id", () => {
        const { market, ledger, zipper } = catalog();

        for (const id of MISSING_IDS) {
            expect(market.getAssetByLedgerId(id)).toBeNull();
            expect(market.getAsset({ ledgerId: id })).toBeNull();
            expect(ledger.getAssetByLedgerId(id)).toBeNull();
            expect(ledger.isKnownAssetId(id)).toBe(false);
            expect(zipper.getAssetByLedgerId(id)).toBeNull();
            expect(zipper.getAsset({ ledgerId: id })).toBeNull();
        }
    });

    it("require* throws CatalogLookupError naming the reader and the id", () => {
        const { market, ledger, zipper } = catalog();

        for (const id of MISSING_IDS) {
            expect(() => market.requireAssetByLedgerId(id)).toThrow(
                new CatalogLookupError("market", "ledgerId", id),
            );
            expect(() => market.requireAsset({ ledgerId: id })).toThrow(
                new CatalogLookupError("market", "ledgerId", id),
            );
            expect(() => ledger.requireAssetByLedgerId(id)).toThrow(
                new CatalogLookupError("ledger", "ledgerId", id),
            );
            expect(() => ledger.requireSymbolByLedgerId(id)).toThrow(
                new CatalogLookupError("ledger", "ledgerId", id),
            );
            expect(() => zipper.requireAssetByLedgerId(id)).toThrow(
                new CatalogLookupError("zipper", "ledgerId", id),
            );
            expect(() => zipper.requireAsset({ ledgerId: id })).toThrow(
                new CatalogLookupError("zipper", "ledgerId", id),
            );
        }
    });

    it("fails closed when a decimal conversion asks for an unknown asset scale", () => {
        const scales = createCatalogSdkScales(() => catalog());

        expect(scales.ledgerAmount(1)).toBe(8);
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
});
