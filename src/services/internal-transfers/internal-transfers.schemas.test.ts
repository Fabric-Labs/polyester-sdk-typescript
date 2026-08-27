import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { formatId } from "../../utils/base58-id.js";
import {
    createCreateInternalTransferInputSchema,
    createCreateInternalTransferResultSchema,
} from "./internal-transfers.schemas.js";

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

const CreateInternalTransferInputSchema = createCreateInternalTransferInputSchema(testScales());
const CreateInternalTransferResultSchema = createCreateInternalTransferResultSchema();

describe("CreateInternalTransferInputSchema", () => {
    it("converts decimal quantities and destination IDs to proto fields", () => {
        const input = v.parse(CreateInternalTransferInputSchema, {
            account: { subaccountId: formatId(11n) },
            destination: { type: "account", accountId: formatId(22n) },
            assetId: 1,
            quantity: "1.5",
            idempotencyKey: " transfer-1 ",
        });

        expect(input).toEqual({
            subaccountId: 11n,
            destination: { case: "destinationAccountId", value: 22n },
            assetId: 1,
            amountE18: { hi: 0n, lo: 1_500_000_000_000_000_000n },
            idempotencyKey: "transfer-1",
        });
    });

    it("converts subaccount destinations to the generated oneof case", () => {
        const input = v.parse(CreateInternalTransferInputSchema, {
            destination: { type: "subaccount", subaccountId: formatId(33n) },
            assetId: 1,
            quantity: "0.000001",
            idempotencyKey: "transfer-2",
        });

        expect(input.destination).toEqual({
            case: "destinationSubaccountId",
            value: 33n,
        });
        expect(input.amountE18).toEqual({ hi: 0n, lo: 1_000_000_000_000n });
        expect(input.subaccountId).toBeUndefined();
    });

    it("trims smart account address destinations", () => {
        const input = v.parse(CreateInternalTransferInputSchema, {
            destination: { type: "smartAccountAddress", address: " 0xabc123 " },
            assetId: 1,
            quantity: "1",
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
                quantity: "1",
                idempotencyKey: "transfer-4",
            }),
        ).toThrow();
        expect(() =>
            v.parse(CreateInternalTransferInputSchema, {
                assetId: 1,
                quantity: "1",
                idempotencyKey: "transfer-5",
            }),
        ).toThrow();
        expect(() =>
            v.parse(CreateInternalTransferInputSchema, {
                destination: { type: "account", accountId: formatId(22n) },
                assetId: 1,
                quantity: "0",
                idempotencyKey: "transfer-6",
            }),
        ).toThrow(/quantity must be greater than 0/);
        expect(() =>
            v.parse(CreateInternalTransferInputSchema, {
                destination: { type: "account", accountId: formatId(22n) },
                assetId: 1,
                quantity: "1.2345678",
                idempotencyKey: "transfer-7",
            }),
        ).toThrow(/quantity supports at most 6 decimal places/);
        expect(() =>
            v.parse(CreateInternalTransferInputSchema, {
                destination: { type: "account", accountId: formatId(22n) },
                assetId: 1,
                quantity: "1",
                idempotencyKey: "",
            }),
        ).toThrow();
    });
});

describe("CreateInternalTransferResultSchema", () => {
    it("converts result quantities to decimal strings and normalizes resolved destination IDs", () => {
        const result = v.parse(CreateInternalTransferResultSchema, {
            requestId: "req-1",
            transferId: "transfer-1",
            acceptedAtTsNs: 1_700_000_000_123_456_789n,
            assetId: 1,
            assetCode: "USDC",
            uAssetId: "u-usdc",
            amountE18: { hi: 0n, lo: 1_000_000_000_000_000_000n },
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
            quantity: "1",
            destination: {
                rootAccountId: "root-public",
                subaccountId: "sub-public",
                smartAccountAddress: "0xabc123",
            },
        });
    });

    it("rejects empty response identifiers and asset fields", () => {
        const validResponse = {
            requestId: "req-1",
            transferId: "transfer-1",
            acceptedAtTsNs: 1_700_000_000_123_456_789n,
            assetId: 1,
            assetCode: "USDC",
            uAssetId: "u-usdc",
            amountE18: { hi: 0n, lo: 1_000_000_000_000_000_000n },
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
