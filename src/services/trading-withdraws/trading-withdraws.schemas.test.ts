import { describe, expect, it } from "vitest";
import {
    createCreateTradingWithdrawToFundingInputSchema,
    CreateTradingWithdrawResultSchema,
} from "./trading-withdraws.schemas.js";
import * as v from "valibot";

const CreateTradingWithdrawToFundingInputSchema = createCreateTradingWithdrawToFundingInputSchema();

describe("CreateTradingWithdrawToFundingInputSchema", () => {
    it("maps raw scaled quantity and source subaccount to proto fields", () => {
        const input = v.parse(CreateTradingWithdrawToFundingInputSchema, {
            account: { subaccountId: "11" },
            assetId: 1,
            quantityScaled: "1250000",
            idempotencyKey: " withdraw-1 ",
            destinationAddress: " 0xabc123 ",
        });

        expect(input).toMatchObject({
            subaccountId: 11n,
            assetId: 1,
            quantityScaled: 1_250_000n,
            idempotencyKey: "withdraw-1",
            destinationAddress: "0xabc123",
        });
    });

    it("accepts an already-scaled quantity", () => {
        const input = v.parse(CreateTradingWithdrawToFundingInputSchema, {
            assetId: 1,
            quantityScaled: "1000000",
            idempotencyKey: "withdraw-2",
        });

        expect(input.quantityScaled).toBe(1_000_000n);
        expect(input.subaccountId).toBeUndefined();
        expect(input.destinationAddress).toBe("");
    });

    it("rejects invalid payloads", () => {
        expect(() =>
            v.parse(CreateTradingWithdrawToFundingInputSchema, {
                assetId: 1,
                quantityScaled: "not-a-number",
                idempotencyKey: "withdraw-3",
            }),
        ).toThrow();
        expect(() =>
            v.parse(CreateTradingWithdrawToFundingInputSchema, {
                assetId: 1,
                quantityScaled: "0",
                idempotencyKey: "withdraw-4",
            }),
        ).toThrow();
        expect(() =>
            v.parse(CreateTradingWithdrawToFundingInputSchema, {
                assetId: 1,
                quantityScaled: "1",
                idempotencyKey: "",
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
