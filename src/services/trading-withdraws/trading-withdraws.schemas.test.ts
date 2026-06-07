import { describe, expect, it } from "vitest";
import { CreateTradingWithdrawToFundingInputSchema } from "./trading-withdraws.schemas.js";
import * as v from "valibot";

describe("CreateTradingWithdrawToFundingInputSchema", () => {
    it("converts decimal amount and source subaccount to proto fields", () => {
        const input = v.parse(CreateTradingWithdrawToFundingInputSchema, {
            subaccountId: "11",
            assetId: 1,
            amount: "1.25",
            quantityScale: 6,
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
                amount: "1.234",
                quantityScale: 2,
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
