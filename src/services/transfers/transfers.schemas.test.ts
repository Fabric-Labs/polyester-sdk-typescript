import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { LedgerTransferSchema, ListTransfersInputSchema } from "./transfers.schemas.js";

const baseTransfer = {
    txId: "tx-1",
    assetId: 1,
    isDebit: false,
    type: 1,
    accountCode: 1,
};

describe("LedgerTransferSchema", () => {
    it("converts nanosecond timestamps to millisecond precision", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            timestamp: 1_700_000_000_123_456_789n,
        });

        expect(transfer.timestamp).toBe(1_700_000_000_123);
    });

    it("converts large bigint timestamps without coercing the raw value to number first", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            timestamp: 9_223_372_036_854_775_807n,
        });

        expect(transfer.timestamp).toBe(9_223_372_036_854);
    });

    it("preserves zero timestamps", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            timestamp: 0n,
        });

        expect(transfer.timestamp).toBe(0);
    });

    it("rejects transfers without a timestamp", () => {
        expect(() => v.parse(LedgerTransferSchema, baseTransfer)).toThrow();
    });
});

describe("ListTransfersInputSchema", () => {
    it("applies defaults and converts IDs and cursors to proto fields", () => {
        const input = v.parse(ListTransfersInputSchema, {
            subaccountId: "11",
            since: 123,
            timestampMin: 1_700_000_000_123,
            timestampMax: 1_700_000_001_123,
            code: 1030,
        });

        expect(input).toEqual({
            subaccountId: 11n,
            ledger: 0,
            reversed: false,
            timestampMin: 1_700_000_000_123_000_000n,
            timestampMax: 1_700_000_001_123_000_000n,
            code: 1030,
            since: 123n,
        });
    });

    it("treats empty subaccount input as main account", () => {
        const input = v.parse(ListTransfersInputSchema, {
            subaccountId: "",
        });

        expect(input.subaccountId).toBeUndefined();
    });

    it("rejects invalid subaccount and cursor inputs", () => {
        expect(() => v.parse(ListTransfersInputSchema, { subaccountId: "-1" })).toThrow();
        expect(() => v.parse(ListTransfersInputSchema, { since: 12.5 })).toThrow();
        expect(() => v.parse(ListTransfersInputSchema, { timestampMin: 12.5 })).toThrow();
        expect(() => v.parse(ListTransfersInputSchema, { timestampMax: -1 })).toThrow();
        expect(() => v.parse(ListTransfersInputSchema, { code: 1.5 })).toThrow();
    });
});
