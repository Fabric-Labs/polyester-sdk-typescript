import { describe, expect, it } from "vitest";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    createCreateTradingWithdrawToExternalChainInputSchema,
    createCreateTradingWithdrawToFundingInputSchema,
    CreateTradingWithdrawResultSchema,
} from "./trading-withdraws.schemas.js";
import * as v from "valibot";

const usdc = {
    symbol: "USDC",
    ledgerId: 1,
    name: "USD Coin",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};

function testScales() {
    const catalog = createTestCatalog({ assets: [usdc] });
    return createCatalogSdkScales(() => catalog);
}

const CreateTradingWithdrawToFundingInputSchema =
    createCreateTradingWithdrawToFundingInputSchema(testScales());
const CreateTradingWithdrawToExternalChainInputSchema =
    createCreateTradingWithdrawToExternalChainInputSchema(testScales());

describe("CreateTradingWithdrawToFundingInputSchema", () => {
    it("converts decimal quantities and source subaccount to proto fields", () => {
        const input = v.parse(CreateTradingWithdrawToFundingInputSchema, {
            account: { subaccountId: "11" },
            assetId: 1,
            quantity: "1.25",
            idempotencyKey: " withdraw-1 ",
            destinationAddress: " 0xabc123 ",
        });

        expect(input).toMatchObject({
            subaccountId: 11n,
            payload: {
                assetId: 1,
                destinationChainId: 0n,
                // "1.25" at the E18 ledger scale, not the USDC quantityScale (6).
                amountE18: {
                    hi: 1_250_000_000_000_000_000n >> 64n,
                    lo: 1_250_000_000_000_000_000n & ((1n << 64n) - 1n),
                },
                idempotencyKey: "withdraw-1",
                destinationAddress: "0xabc123",
            },
        });
    });

    it("converts whole-number quantities at the E18 ledger scale", () => {
        const input = v.parse(CreateTradingWithdrawToFundingInputSchema, {
            assetId: 1,
            quantity: "1",
            idempotencyKey: "withdraw-2",
        });

        expect(input.payload.amountE18).toMatchObject({
            hi: 1_000_000_000_000_000_000n >> 64n,
            lo: 1_000_000_000_000_000_000n & ((1n << 64n) - 1n),
        });
        expect(input.subaccountId).toBeUndefined();
        expect(input.payload.destinationAddress).toBe("");
    });

    it("rejects invalid payloads", () => {
        expect(() =>
            v.parse(CreateTradingWithdrawToFundingInputSchema, {
                assetId: 1,
                quantity: "not-a-number",
                idempotencyKey: "withdraw-3",
            }),
        ).toThrow(/quantity must be a non-negative decimal number/);
        expect(() =>
            v.parse(CreateTradingWithdrawToFundingInputSchema, {
                assetId: 1,
                quantity: "0",
                idempotencyKey: "withdraw-4",
            }),
        ).toThrow(/quantity must be greater than 0/);
        expect(() =>
            v.parse(CreateTradingWithdrawToFundingInputSchema, {
                assetId: 1,
                quantity: "1.2345678",
                idempotencyKey: "withdraw-5",
            }),
        ).toThrow(/quantity supports at most 6 decimal places/);
        expect(() =>
            v.parse(CreateTradingWithdrawToFundingInputSchema, {
                assetId: 1,
                quantity: "1",
                idempotencyKey: "",
            }),
        ).toThrow();
    });
});

describe("CreateTradingWithdrawToExternalChainInputSchema", () => {
    it("requires destination chain details and converts decimal quantities", () => {
        const input = v.parse(CreateTradingWithdrawToExternalChainInputSchema, {
            account: { subaccountId: "11" },
            assetId: 1,
            quantity: "1.25",
            destinationChainId: 10_009,
            destinationAddress: " rAddress:123 ",
            idempotencyKey: " withdraw-1 ",
        });

        expect(input).toMatchObject({
            subaccountId: 11n,
            payload: {
                assetId: 1,
                destinationChainId: 10_009n,
                amountE18: {
                    hi: 1_250_000_000_000_000_000n >> 64n,
                    lo: 1_250_000_000_000_000_000n & ((1n << 64n) - 1n),
                },
                destinationAddress: "rAddress:123",
                idempotencyKey: "withdraw-1",
            },
        });
    });

    it("rejects missing external destination fields", () => {
        expect(() =>
            v.parse(CreateTradingWithdrawToExternalChainInputSchema, {
                assetId: 1,
                quantity: "1",
                destinationChainId: 0,
                destinationAddress: "0xabc123",
                idempotencyKey: "withdraw-1",
            }),
        ).toThrow();
        expect(() =>
            v.parse(CreateTradingWithdrawToExternalChainInputSchema, {
                assetId: 1,
                quantity: "1",
                destinationChainId: 1,
                destinationAddress: "",
                idempotencyKey: "withdraw-1",
            }),
        ).toThrow();
    });
});

describe("CreateTradingWithdrawResultSchema", () => {
    it("trims and preserves accepted intent IDs", () => {
        const result = v.parse(CreateTradingWithdrawResultSchema, {
            intentId: " intent-1 ",
        });

        expect(result).toEqual({ intentId: "intent-1" });
    });

    it("rejects empty backend intent IDs", () => {
        expect(() => v.parse(CreateTradingWithdrawResultSchema, { intentId: "" })).toThrow();
    });
});
