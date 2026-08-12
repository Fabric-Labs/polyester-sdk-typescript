import { afterEach, describe, expect, it, vi } from "vitest";
import * as catalogs from "./index.js";
import { createTestCatalog } from "../testing/catalog.js";
import {
    CatalogConversionError,
    CatalogLookupError,
    CatalogValidationFailedError,
} from "./types.js";
import { ValidationError } from "../shared/errors.js";

const BTC = {
    symbol: "BTC",
    ledgerId: 1,
    name: "Bitcoin",
    quantityDisplayDecimals: 5,
    quantityScale: 8,
};

const USDC = {
    symbol: "USDC",
    ledgerId: 2,
    name: "USD Coin",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};

afterEach(() => {
    vi.useRealTimers();
});

const BTC_USDC = {
    symbolId: 7,
    symbol: "BTC-USDC",
    baseAsset: "BTC",
    quoteAsset: "USDC",
    tickSize: "0.01",
    stepSize: "0.0001",
    minNotionalQuote: "10",
    minQtyBase: "0.0001",
    allowBuyFeeFromBase: false,
    defaultMarketSlippagePctBuy: 1,
    defaultMarketSlippagePctSell: 1,
    maxClientRefDriftPct: 1,
    baseQuantityScale: 8,
    quoteQuantityScale: 6,
    status: "enabled",
} as const;

const ZIPPER_SEED = {
    chains: [
        {
            chainId: 60,
            code: "ETH",
            name: "Ethereum",
            nativeChainId: "1",
            nativeCurrencySymbol: "ETH",
            explorerUrl: "https://example.com",
            icon: "eth",
            requiredConfirmations: 12,
            confirmationTimeSeconds: 180,
            isCaseSensitive: false,
            minAddressLength: 42,
            maxAddressLength: 42,
        },
    ],
    assets: [
        {
            asset: "BTC",
            ledgerId: 1,
            name: "Bitcoin",
            icon: "btc",
            quantityScale: 8,
            quantityDisplayDecimals: 5,
            uAssetId: "0xaaaa",
            variants: [
                {
                    zippedAssetId: 901,
                    chainId: 60,
                    isNativeAsset: false,
                    networkFee: "0.0001",
                    networkFeeTsSec: 0,
                    depositMinAmount: "0.001",
                    withdrawMinAmount: "0.002",
                    supply: "1.23",
                    sourceToken: { address: "0x1", decimals: 8 },
                    zToken: { address: "0x2", decimals: 8 },
                },
            ],
        },
    ],
    contracts: [
        {
            name: "fundingAccount",
            address: "0x3",
            type: "funding",
            description: "",
            version: 1,
        },
    ],
    tsMs: 123,
} satisfies catalogs.ZipperCatalogSeed;

function catalog() {
    return createTestCatalog({
        assets: [BTC, USDC],
        pairs: [BTC_USDC],
        zipper: ZIPPER_SEED,
    });
}

describe("market conversions", () => {
    it("strictly parses decimal prices into ticks", () => {
        expect(catalog().market.decimalPriceToTicks("65000.01", "BTC-USDC")).toEqual({
            scaledValue: "65000010000",
            decimal: "65000.01",
            display: "65000.01",
            scale: 6,
        });
    });

    it("rejects malformed or over-precise decimal input", () => {
        const market = catalog().market;
        expect(() => market.decimalPriceToTicks("", "BTC-USDC")).toThrow(CatalogConversionError);
        expect(() => market.decimalPriceToTicks("abc", "BTC-USDC")).toThrow(CatalogConversionError);
        expect(() => market.decimalPriceToTicks("-1", "BTC-USDC")).toThrow(CatalogConversionError);
        expect(() => market.decimalPriceToTicks("1.1234567", "BTC-USDC")).toThrow(
            "price supports at most 6 decimal places",
        );
        expect(() => market.decimalQuantityToScaled("0.123456789", 7)).toThrow(
            "quantity supports at most 8 decimal places",
        );
    });

    it("rejects non-integer raw values on the scaled side", () => {
        const market = catalog().market;
        expect(() => market.priceTicksToDecimalString("1.5", "BTC-USDC")).toThrow(
            CatalogConversionError,
        );
        expect(() => market.quantityScaledToDisplayString("12,3", 7)).toThrow(
            CatalogConversionError,
        );
    });

    it("converts quantities using the base asset scale and display decimals", () => {
        const market = catalog().market;
        expect(market.decimalQuantityToScaled("1.5", 7)).toEqual({
            scaledValue: "150000000",
            decimal: "1.5",
            display: "1.5",
            scale: 8,
        });
        expect(market.quantityScaledToDecimalString(123456789n, 7)).toBe("1.23456789");
        // 8-dp quantity rounded half-up to 5 display decimals
        expect(market.quantityScaledToDisplayString("123456789", 7)).toBe("1.23457");
    });

    it("converts quote amounts using the quote asset scale and display decimals", () => {
        const market = catalog().market;
        expect(market.decimalQuoteAmountToScaled("250.5", "BTC-USDC")).toEqual({
            scaledValue: "250500000",
            decimal: "250.5",
            display: "250.5",
            scale: 6,
        });
        expect(market.quoteAmountScaledToDecimalString("250505999", 7)).toBe("250.505999");
        expect(market.quoteAmountScaledToDisplayString("250505999", 7)).toBe("250.51");
    });

    it("derives price display precision from the tick size", () => {
        expect(catalog().market.priceTicksToDisplayString("65000019999", 7)).toBe("65000.02");
        expect(catalog().market.priceTicksToDecimalString("65000019999", 7)).toBe("65000.019999");
    });

    it("handles negative scaled values for decimal and display strings", () => {
        const market = catalog().market;
        expect(market.quantityScaledToDecimalString(-123456789n, 7)).toBe("-1.23456789");
        expect(market.quantityScaledToDisplayString(-123456789n, 7)).toBe("-1.23457");
    });

    it("truncates without rounding in input normalizers", () => {
        const market = catalog().market;
        expect(market.normalizePriceInput("65000.0199999", "BTC-USDC")).toBe("65000.019999");
        expect(market.normalizeQuantityInput("1.234567899", 7)).toBe("1.23456789");
        expect(market.normalizeQuoteAmountInput("10.0000009", 7)).toBe("10");
        expect(market.normalizeQuantityInput(".5", 7)).toBe("0.5");
        expect(market.normalizeQuantityInput("5.", 7)).toBe("5");
        expect(market.normalizeQuantityInput("007", 7)).toBe("7");
        expect(() => market.normalizeQuantityInput("1..2", 7)).toThrow(CatalogConversionError);
    });

    it("supports object lookup keys", () => {
        const market = catalog().market;
        expect(market.requirePair({ symbolId: 7 }).symbol).toBe("BTC-USDC");
        expect(market.requirePair({ symbol: "BTC-USDC" }).symbolId).toBe(7);
        expect(market.requireAsset({ ledgerId: 1 }).symbol).toBe("BTC");
        expect(market.requireAsset({ symbol: "USDC" }).ledgerId).toBe(2);
        expect(market.requireAsset({ ledgerId: 99 })).toMatchObject({
            symbol: "Unknown asset",
            ledgerId: 9999,
        });
    });
});

describe("ledger conversions", () => {
    it("parses and renders single-asset amounts", () => {
        const ledger = catalog().ledger;
        expect(ledger.decimalAmountToScaled("0.123", "BTC")).toEqual({
            scaledValue: "12300000",
            decimal: "0.123",
            display: "0.123",
            scale: 8,
        });
        expect(ledger.amountScaledToDecimalString("12345678", 1)).toBe("0.12345678");
        expect(ledger.amountScaledToDisplayString("12345678", 1)).toBe("0.12346");
        expect(ledger.normalizeAmountInput("0.123456789", "BTC")).toBe("0.12345678");
    });

    it("keeps strict lookups for unknown assets", () => {
        const ledger = catalog().ledger;
        expect(() => ledger.decimalAmountToScaled("1", "NOPE")).toThrow(CatalogLookupError);
        expect(ledger.isKnownAssetId(0)).toBe(false);
        expect(ledger.isKnownAssetId(1)).toBe(true);
    });
});

describe("spot order constraints and validation", () => {
    it("exposes pair constraints including status", () => {
        expect(catalog().orders.getSpotOrderConstraints("BTC-USDC")).toEqual({
            symbolId: 7,
            symbol: "BTC-USDC",
            status: "enabled",
            tickSize: "0.01",
            stepSize: "0.0001",
            minQtyBase: "0.0001",
            minNotionalQuote: "10",
            priceScale: 6,
            quantityScale: 8,
            quoteAmountScale: 6,
            priceDisplayDecimals: 2,
            quantityDisplayDecimals: 5,
            quoteAmountDisplayDecimals: 2,
        });
    });

    it("accepts valid quantity and price input", () => {
        expect(
            catalog().orders.validateSpotOrderDecimalInput({
                pair: "BTC-USDC",
                quantity: "0.5",
                price: "65000.01",
            }),
        ).toEqual({ valid: true, errors: [] });
    });

    it("reports typed validation errors for each violated rule", () => {
        const result = catalog().orders.validateSpotOrderDecimalInput({
            pair: "BTC-USDC",
            quantity: "0.50015",
            price: "65000.015",
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual([
            expect.objectContaining({ field: "quantity", rule: "stepSize", expected: "0.0001" }),
            expect.objectContaining({ field: "price", rule: "tickSize", expected: "0.01" }),
        ]);
    });

    it("reports parse failures as validation errors instead of throwing", () => {
        const result = catalog().orders.validateSpotOrderDecimalInput({
            pair: "BTC-USDC",
            quantity: "abc",
            price: "-5",
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual([
            expect.objectContaining({ field: "quantity", rule: "parse" }),
            expect.objectContaining({ field: "price", rule: "parse" }),
        ]);
    });

    it("enforces min quantity and min notional when price is present", () => {
        const orders = catalog().orders;

        const belowMinQty = orders.validateSpotOrderDecimalInput({
            pair: "BTC-USDC",
            quantity: "0",
        });
        expect(belowMinQty.errors).toEqual([
            expect.objectContaining({ field: "quantity", rule: "minQty", expected: "0.0001" }),
        ]);

        const belowMinNotional = orders.validateSpotOrderDecimalInput({
            pair: "BTC-USDC",
            quantity: "0.0001",
            price: "0.01",
        });
        expect(belowMinNotional.valid).toBe(false);
        expect(belowMinNotional.errors).toEqual([
            expect.objectContaining({
                field: "notional",
                rule: "minNotional",
                expected: "10",
                actual: "0.000001",
            }),
        ]);

        // no price → notional is not checked
        expect(
            orders.validateSpotOrderDecimalInput({ pair: "BTC-USDC", quantity: "0.0001" }).valid,
        ).toBe(true);
    });

    it("assertSpotOrderDecimalInput throws a typed validation error", () => {
        try {
            catalog().orders.assertSpotOrderDecimalInput({
                pair: "BTC-USDC",
                quantity: "0.00015",
            });
            expect.fail("expected validation to throw");
        } catch (error) {
            expect(error).toBeInstanceOf(CatalogValidationFailedError);
            expect(error).toMatchObject({
                code: "CATALOG_VALIDATION_FAILED",
                errors: [expect.objectContaining({ field: "quantity", rule: "stepSize" })],
            });
        }
    });
});

describe("zipper lookups", () => {
    it("resolves assets by uAssetId", () => {
        const zipper = catalog().zipper;
        expect(zipper.requireAssetByUAssetId("0xaaaa").asset).toBe("BTC");
        expect(zipper.getAssetByUAssetId("0xbbbb")).toBeNull();
        expect(() => zipper.requireAssetByUAssetId("0xbbbb")).toThrow(CatalogLookupError);
    });

    it("resolves asset-chain routes by zippedAssetId", () => {
        const zipper = catalog().zipper;
        const route = zipper.requireAssetChainByZippedAssetId(901);
        expect(route.asset.asset).toBe("BTC");
        expect(route.chain.chainId).toBe(60);
        expect(route.chain.zippedAssetId).toBe(901);
        expect(zipper.getAssetChainByZippedAssetId(902)).toBeNull();
    });

    it("resolves zippedAssetId from asset and chain keys", () => {
        const zipper = catalog().zipper;
        expect(zipper.requireZippedAssetId("BTC", "ETH")).toBe(901);
        expect(zipper.getZippedAssetId("BTC", { chainId: 60 })).toBe(901);
        expect(zipper.getZippedAssetId("BTC", "NOPE")).toBeNull();
    });

    it("supports chain and contract lookups with object keys and escape hatches", () => {
        const zipper = catalog().zipper;
        expect(zipper.requireChain({ chainId: 60 }).code).toBe("ETH");
        expect(zipper.requireChain("ETH").chainId).toBe(60);
        expect(zipper.requireContract("fundingAccount").address).toBe("0x3");
        expect(zipper.getContract("somethingElse")).toBeNull();
        expect(() => zipper.requireContractByName("somethingElse")).toThrow(CatalogLookupError);
    });

    it("preserves the zipper millisecond timestamp as tsMs", () => {
        expect(catalog().snapshot().zipper.tsMs).toBe(123);
    });

    it("patches matching zipper route supply into a new snapshot", () => {
        vi.useFakeTimers();
        vi.setSystemTime(456);
        const snapshot = catalog().snapshot();
        const next = catalogs.patchZipperCatalogSupply(snapshot, [
            { zippedAssetId: 901, supply: "9.87" },
            { zippedAssetId: 902, supply: "5" },
        ]);

        expect(next).not.toBe(snapshot);
        expect(next.version).toBe(snapshot.version + 1);
        expect(next.tsMs).toBe(456);
        expect(next.zipper.tsMs).toBe(456);
        expect(next.zipper.assets[0]?.chains[0]?.supply).toBe("9.87");
        expect(next.market).toBe(snapshot.market);
        expect(next.zipper.chains).toBe(snapshot.zipper.chains);

        expect(catalogs.patchZipperCatalogSupply(next, [{ zippedAssetId: 902, supply: "5" }])).toBe(
            next,
        );
    });
});

describe("catalogs export surface", () => {
    it("exposes the sanctioned catalog API", () => {
        expect(catalogs).toEqual(
            expect.objectContaining({
                createPolyesterCatalog: expect.any(Function),
                createCatalogSnapshotReader: expect.any(Function),
                buildCatalogSnapshot: expect.any(Function),
                CatalogConversionError: expect.any(Function),
                CatalogLookupError: expect.any(Function),
                CatalogNotReadyError: expect.any(Function),
                CatalogValidationFailedError: expect.any(Function),
                PAIR_STATUSES: expect.any(Array),
            }),
        );
    });

    it("does not export low-level decimal helpers", () => {
        expect(catalogs).not.toEqual(
            expect.objectContaining({
                intToDecimalString: expect.anything(),
                int6ToDecimalString: expect.anything(),
                int18ToDecimalString: expect.anything(),
                formatToDecimals: expect.anything(),
                formatLedgerDecimal: expect.anything(),
                LEDGER_SCALE: expect.anything(),
            }),
        );
    });
});

describe("catalog runtime boundaries", () => {
    it.each([null, undefined, {}, "nope"])("rejects malformed snapshot readers", (snapshot) => {
        expect(() => catalogs.createCatalogSnapshotReader(snapshot as never)).toThrow(
            ValidationError,
        );
    });

    it("validates a snapshot before applying an empty supply patch", () => {
        expect(() => catalogs.patchZipperCatalogSupply(null as never, [])).toThrow(ValidationError);
    });

    it("rejects malformed supply updates without advancing snapshot freshness", () => {
        const snapshot = catalog().snapshot();
        const originalTimestamp = snapshot.tsMs;

        expect(() =>
            catalogs.patchZipperCatalogSupply(snapshot, [
                { zippedAssetId: 901, supply: null as never },
            ]),
        ).toThrow(ValidationError);
        expect(snapshot.version).toBe(1);
        expect(snapshot.tsMs).toBe(originalTimestamp);
    });

    it.each([undefined, {}])("rejects malformed snapshot builder input", (input) => {
        expect(() => catalogs.buildCatalogSnapshot(input as never)).toThrow(ValidationError);
    });
});
