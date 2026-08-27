import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { TransferCode } from "../../gen/ledger/v1/catalog_pb.js";
import { formatId } from "../../utils/base58-id.js";
import {
    LedgerTransferSchema,
    LedgerTransferSideSchema,
    ListTransfersInputSchema,
} from "./transfers.schemas.js";

const onePointFiveE18 = 1_500_000_000_000_000_000n;
const twoPointFiveE18 = 2_500_000_000_000_000_000n;

const baseTransfer = {
    assetId: 1,
    isDebit: false,
    transferCode: 1030,
    accountCode: 301,
};

describe("LedgerTransferSchema", () => {
    it("converts a zero balanceAfter to a decimal string", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            amountE18: { hi: 0n, lo: onePointFiveE18 },
            balanceAfterE18: { hi: 0n, lo: 0n },
            tsUs: 0n,
        });

        expect(transfer.amount).toBe("1.5");
        expect(transfer.balanceAfter).toBe("0");
    });

    it("omits balanceAfter when the backend does not provide it", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            amountE18: { hi: 0n, lo: onePointFiveE18 },
            tsUs: 0n,
        });

        expect(transfer.balanceAfter).toBeUndefined();
    });

    it("converts non-zero balanceAfter to a decimal string", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            amountE18: { hi: 0n, lo: onePointFiveE18 },
            balanceAfterE18: { hi: 0n, lo: twoPointFiveE18 },
            tsUs: 0n,
        });

        expect(transfer.balanceAfter).toBe("2.5");
    });

    it("preserves link ids beyond Number's safe integer range", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            linkId: 9_007_199_254_740_993n,
            tsUs: 0n,
        });

        expect(transfer.linkId).toBe("9007199254740993");
    });

    it("preserves unknown asset ids using the catalog fallback path", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            assetId: 404,
            amountE18: { hi: 0n, lo: onePointFiveE18 },
            tsUs: 0n,
        });

        expect(transfer).toMatchObject({
            assetId: 404,
            amount: "1.5",
        });
    });

    it("converts microsecond cluster timestamps to millisecond precision", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            tsUs: 1_781_190_257_836_112n,
        });

        expect(transfer.timestamp).toBe(1_781_190_257_836);
    });

    it("converts microsecond wire timestamps to millisecond precision", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            tsUs: 1_700_000_000_123_456n,
        });

        expect(transfer.timestamp).toBe(1_700_000_000_123);
    });

    it("accepts numeric websocket timestamps and normalizes them to milliseconds", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            tsUs: 1_700_000_000_123_456,
        });

        expect(transfer.timestamp).toBe(1_700_000_000_123);
    });

    it("accepts decimal string wire timestamps", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            tsUs: "1700000000123456789",
        });

        expect(transfer.timestamp).toBe(1_700_000_000_123);
    });

    it("converts large bigint timestamps without coercing the raw value to number first", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            tsUs: 9_223_372_036_854_775_807n,
        });

        expect(transfer.timestamp).toBe(9_223_372_036_854);
    });

    it("preserves zero timestamps", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            tsUs: 0n,
        });

        expect(transfer.timestamp).toBe(0);
    });

    it("maps transfer display sides", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            tsUs: 0n,
            source: {
                kind: Proto.TransferSideKind.TRADING_ACCOUNT,
                accountId: 11n,
                address: "0x1111111111111111111111111111111111111111",
            },
            destination: {
                kind: Proto.TransferSideKind.PRIVATE_COUNTERPARTY,
                address: "",
            },
        });

        expect(transfer.source).toEqual({
            kind: "trading_account",
            accountId: formatId(11n),
            address: "0x1111111111111111111111111111111111111111",
        });
        expect(transfer.destination).toEqual({
            kind: "private_counterparty",
            accountId: undefined,
            address: "",
        });
    });

    it("exposes an unspecified display side without dropping the transfer", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            amountE18: { hi: 0n, lo: onePointFiveE18 },
            tsUs: 0n,
            source: {
                kind: Proto.TransferSideKind.TRANSFER_SIDE_KIND_UNSPECIFIED,
            },
            destination: {
                kind: Proto.TransferSideKind.TRADING_ACCOUNT,
                accountId: 11n,
            },
        });

        expect(transfer).toMatchObject({
            assetId: 1,
            amount: "1.5",
            type: "internal_transfer",
            accountCode: "trading",
            timestamp: 0,
            source: {
                kind: "unspecified",
            },
            destination: {
                kind: "trading_account",
                accountId: formatId(11n),
            },
        });
        expect(transfer.source?.address).toBe("");
    });

    it("maps an unspecified standalone display side", () => {
        expect(
            v.parse(LedgerTransferSideSchema, {
                kind: Proto.TransferSideKind.TRANSFER_SIDE_KIND_UNSPECIFIED,
            }),
        ).toEqual({
            kind: "unspecified",
            accountId: undefined,
            address: "",
        });
    });

    it("rejects transfers without a timestamp", () => {
        expect(() => v.parse(LedgerTransferSchema, baseTransfer)).toThrow();
    });

    it("decodes retained trading-withdraw request fees", () => {
        const transfer = v.parse(LedgerTransferSchema, {
            ...baseTransfer,
            transferCode: TransferCode.TRADING_WITHDRAW_REQUEST_FEE,
            tsUs: 0n,
        });

        expect(transfer.type).toBe("trading_withdraw_request_fee");
    });
});

describe("ListTransfersInputSchema", () => {
    it("applies defaults and converts IDs and page tokens to proto fields", () => {
        const input = v.parse(ListTransfersInputSchema, {
            account: { subaccountId: formatId(11n) },
            pageToken: "cursor-1",
            timestampMin: 1_700_000_000_123,
            timestampMax: 1_700_000_001_123,
            transferCode: "internal_transfer",
        });

        expect(input).toEqual({
            subaccountId: 11n,
            ledger: 0,
            reversed: false,
            tsMinUs: 1_700_000_000_123_000n,
            tsMaxUs: 1_700_000_001_123_000n,
            transferCode: 1030,
            pageToken: "cursor-1",
        });
    });

    it("treats explicit main account scope as main account", () => {
        const input = v.parse(ListTransfersInputSchema, {
            account: "main",
        });

        expect(input.subaccountId).toBeUndefined();
    });

    it("encodes the trading-withdraw request-fee filter", () => {
        const input = v.parse(ListTransfersInputSchema, {
            transferCode: "trading_withdraw_request_fee",
        });

        expect(input.transferCode).toBe(TransferCode.TRADING_WITHDRAW_REQUEST_FEE);
    });

    it("rejects legacy or invalid account and cursor inputs", () => {
        expect(() => v.parse(ListTransfersInputSchema, { subaccountId: "" })).toThrow();
        expect(() => v.parse(ListTransfersInputSchema, { subaccountId: "-1" })).toThrow();
        expect(() =>
            v.parse(ListTransfersInputSchema, { account: { subaccountId: "-1" } }),
        ).toThrow();
        expect(() => v.parse(ListTransfersInputSchema, { pageToken: 12.5 as never })).toThrow();
        expect(() => v.parse(ListTransfersInputSchema, { timestampMin: 12.5 })).toThrow();
        expect(() => v.parse(ListTransfersInputSchema, { timestampMax: -1 })).toThrow();
        expect(() => v.parse(ListTransfersInputSchema, { code: 1030 })).toThrow();
        expect(() =>
            v.parse(ListTransfersInputSchema, { transferCode: "not_a_transfer_code" }),
        ).toThrow();
    });
});
