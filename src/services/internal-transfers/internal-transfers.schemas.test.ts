import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
    CreateInternalTransferInputSchema,
    CreateInternalTransferResultSchema,
} from "./internal-transfers.schemas.js";

describe("CreateInternalTransferInputSchema", () => {
    it("converts source subaccount and account destination IDs to proto fields", () => {
        const input = v.parse(CreateInternalTransferInputSchema, {
            subAccountId: "11",
            destination: { type: "account", accountId: "22" },
            assetId: 1,
            quantityScaled: "1000000",
            idempotencyKey: " transfer-1 ",
        });

        expect(input).toEqual({
            subaccountId: 11n,
            destination: { case: "destinationAccountId", value: 22n },
            assetId: 1,
            quantityScaled: 1000000n,
            idempotencyKey: "transfer-1",
        });
    });

    it("converts subaccount destinations to the generated oneof case", () => {
        const input = v.parse(CreateInternalTransferInputSchema, {
            destination: { type: "subAccount", subAccountId: "33" },
            assetId: 1,
            quantityScaled: 1n,
            idempotencyKey: "transfer-2",
        });

        expect(input.destination).toEqual({
            case: "destinationSubaccountId",
            value: 33n,
        });
        expect(input.subaccountId).toBeUndefined();
    });

    it("trims smart account address destinations", () => {
        const input = v.parse(CreateInternalTransferInputSchema, {
            destination: { type: "smartAccountAddress", address: " 0xabc123 " },
            assetId: 1,
            quantityScaled: "1",
            idempotencyKey: "transfer-3",
        });

        expect(input.destination).toEqual({
            case: "destinationSmartAccountAddress",
            value: "0xabc123",
        });
    });

    it("rejects invalid payloads", () => {
        expect(() =>
            v.parse(CreateInternalTransferInputSchema, {
                destination: { type: "account", accountId: "" },
                assetId: 1,
                quantityScaled: "1",
                idempotencyKey: "transfer-4",
            }),
        ).toThrow();
        expect(() =>
            v.parse(CreateInternalTransferInputSchema, {
                assetId: 1,
                quantityScaled: "1",
                idempotencyKey: "transfer-5",
            }),
        ).toThrow();
        expect(() =>
            v.parse(CreateInternalTransferInputSchema, {
                destination: { type: "account", accountId: "22" },
                assetId: 1,
                quantityScaled: "0",
                idempotencyKey: "transfer-6",
            }),
        ).toThrow();
        expect(() =>
            v.parse(CreateInternalTransferInputSchema, {
                destination: { type: "account", accountId: "22" },
                assetId: 1,
                quantityScaled: "1",
                idempotencyKey: "",
            }),
        ).toThrow();
    });
});

describe("CreateInternalTransferResultSchema", () => {
    it("preserves result fields and normalizes resolved destination IDs", () => {
        const result = v.parse(CreateInternalTransferResultSchema, {
            requestId: "req-1",
            transferId: "transfer-1",
            acceptedAtUnixNs: 1_700_000_000_123_456_789n,
            assetId: 1,
            assetCode: "USDC",
            uAssetId: "u-usdc",
            quantityScaled: 1000000n,
            destination: {
                rootAccountPublicId: "root-public",
                subaccountPublicId: "sub-public",
                smartAccountAddress: "0xabc123",
            },
        });

        expect(result).toEqual({
            requestId: "req-1",
            transferId: "transfer-1",
            acceptedAtUnixMs: 1_700_000_000_123,
            assetId: 1,
            assetCode: "USDC",
            uAssetId: "u-usdc",
            quantityScaled: "1000000",
            destination: {
                rootAccountId: "root-public",
                subAccountId: "sub-public",
                smartAccountAddress: "0xabc123",
            },
        });
    });

    it("rejects empty response identifiers and asset fields", () => {
        const validResponse = {
            requestId: "req-1",
            transferId: "transfer-1",
            acceptedAtUnixNs: 1_700_000_000_123_456_789n,
            assetId: 1,
            assetCode: "USDC",
            uAssetId: "u-usdc",
            quantityScaled: 1000000n,
        };

        for (const field of ["requestId", "transferId", "assetCode", "uAssetId"] as const) {
            expect(() =>
                v.parse(CreateInternalTransferResultSchema, {
                    ...validResponse,
                    [field]: "",
                }),
            ).toThrow();
        }
    });
});
