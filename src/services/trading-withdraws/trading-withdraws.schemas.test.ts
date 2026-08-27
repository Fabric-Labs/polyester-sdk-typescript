import { describe, expect, it } from "vitest";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { formatId } from "../../utils/base58-id.js";
import { WithdrawDestinationValidationCode } from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import {
    createCreateTradingWithdrawToExternalChainInputSchema,
    createCreateTradingWithdrawToFundingInputSchema,
    CreateTradingWithdrawResultSchema,
    ValidateWithdrawDestinationInputSchema,
    ValidateWithdrawDestinationResultSchema,
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
            account: { subaccountId: formatId(11n) },
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
            account: { subaccountId: formatId(11n) },
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

describe("ValidateWithdrawDestinationInputSchema", () => {
    it("trims the address and converts the chain id to uint64-compatible bigint", () => {
        expect(
            v.parse(ValidateWithdrawDestinationInputSchema, {
                destinationChainId: 10_009,
                destinationAddress: " rAddress:123 ",
            }),
        ).toEqual({
            destinationChainId: 10_009n,
            destinationAddress: "rAddress:123",
        });
    });

    it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
        "rejects invalid chain id %s",
        (destinationChainId) => {
            expect(() =>
                v.parse(ValidateWithdrawDestinationInputSchema, {
                    destinationChainId,
                    destinationAddress: "rAddress:123",
                }),
            ).toThrow();
        },
    );

    it("rejects an empty destination address", () => {
        expect(() =>
            v.parse(ValidateWithdrawDestinationInputSchema, {
                destinationChainId: 10_009,
                destinationAddress: "   ",
            }),
        ).toThrow();
    });
});

describe("ValidateWithdrawDestinationResultSchema", () => {
    it("decodes a valid destination with its canonical address", () => {
        expect(
            v.parse(ValidateWithdrawDestinationResultSchema, {
                valid: true,
                code: WithdrawDestinationValidationCode.VALID,
                message: "Destination is valid.",
                canonicalDestinationAddress: " 0xabc123 ",
            }),
        ).toEqual({
            valid: true,
            code: "valid",
            message: "Destination is valid.",
            canonicalDestinationAddress: "0xabc123",
        });
    });

    it.each([
        [WithdrawDestinationValidationCode.RESULT_UNSPECIFIED, "unspecified"],
        [WithdrawDestinationValidationCode.INVALID_ADDRESS, "invalid_address"],
        [WithdrawDestinationValidationCode.UNSUPPORTED_CHAIN, "unsupported_chain"],
        [WithdrawDestinationValidationCode.POLYESTER_SMART_ACCOUNT, "polyester_smart_account"],
        [WithdrawDestinationValidationCode.TOKEN_CONTRACT, "token_contract"],
        [WithdrawDestinationValidationCode.DENYLISTED_ADDRESS, "denylisted_address"],
    ] as const)("decodes failure code %i as %s", (code, expected) => {
        expect(
            v.parse(ValidateWithdrawDestinationResultSchema, {
                valid: false,
                code,
                message: "Destination cannot be used.",
                canonicalDestinationAddress: "",
            }),
        ).toMatchObject({ valid: false, code: expected });
    });

    it("preserves a canonical address returned with a failed validation", () => {
        expect(
            v.parse(ValidateWithdrawDestinationResultSchema, {
                valid: false,
                code: WithdrawDestinationValidationCode.DENYLISTED_ADDRESS,
                message: "Destination cannot be used.",
                canonicalDestinationAddress: "0xabc123",
            }),
        ).toMatchObject({
            valid: false,
            canonicalDestinationAddress: "0xabc123",
        });
    });

    it("rejects inconsistent or unknown backend outcomes", () => {
        const base = {
            message: "Invalid response.",
            canonicalDestinationAddress: "",
        };
        expect(() =>
            v.parse(ValidateWithdrawDestinationResultSchema, {
                ...base,
                valid: false,
                code: WithdrawDestinationValidationCode.VALID,
            }),
        ).toThrow();
        expect(() =>
            v.parse(ValidateWithdrawDestinationResultSchema, {
                ...base,
                valid: false,
                code: 999,
            }),
        ).toThrow();
    });
});
