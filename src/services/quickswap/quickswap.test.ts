import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/swap/quickswap/v1/quickswap_pb.js";
import { ValidationError } from "../../shared/errors.js";
import { unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { QuickSwapService } from "./quickswap.js";
import type { CreateQuickSwapInput, QuickSwapTermsInput } from "./quickswap.types.js";

const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

const terms: QuickSwapTermsInput = {
    sourceZippedAssetId: 11,
    destinationZippedAssetId: 22,
    basis: "source_amount",
    amount: { baseUnits: "150000000", decimals: 8 },
    protection: { kind: "max_slippage", bps: 50 },
    execution: { type: "market" },
};

const wireTerms = create(Proto.QuickSwapTermsSchema, {
    sourceZippedAssetId: 11,
    destinationZippedAssetId: 22,
    basis: Proto.QuoteBasis.SOURCE_AMOUNT,
    amount: { baseUnits: "150000000", decimals: 8 },
    protection: { bound: { case: "maxSlippageBps", value: 50 } },
    execution: { strategy: { case: "market", value: {} } },
});

const wireQuote = create(Proto.QuickSwapQuoteSchema, {
    depositAmount: { baseUnits: "150000000", decimals: 8 },
    expectedAmountOut: { baseUnits: "4100000000", decimals: 9 },
    minAmountOut: { baseUnits: "4079500000", decimals: 9 },
    minRate: "27.196666666666666667",
    minDepositAmount: { baseUnits: "100000", decimals: 8 },
    maxDepositAmount: { baseUnits: "500000000", decimals: 8 },
    intermediateAssetId: 3,
    fees: [
        { kind: Proto.FeeKind.SERVICE, zippedAssetId: 0, amount: { baseUnits: "12", decimals: 6 } },
        {
            kind: Proto.FeeKind.WITHDRAWAL_NETWORK,
            zippedAssetId: 22,
            amount: { baseUnits: "5000", decimals: 9 },
        },
    ],
    quotedAt: ts(1_700_000_000),
    expiresAt: ts(1_700_000_030),
});

const quote = {
    depositAmount: { baseUnits: "150000000", decimals: 8 },
    expectedAmountOut: { baseUnits: "4100000000", decimals: 9 },
    minAmountOut: { baseUnits: "4079500000", decimals: 9 },
    minRate: "27.196666666666666667",
    minDepositAmount: { baseUnits: "100000", decimals: 8 },
    maxDepositAmount: { baseUnits: "500000000", decimals: 8 },
    intermediateAssetId: 3,
    fees: [
        { kind: "service", zippedAssetId: 0, amount: { baseUnits: "12", decimals: 6 } },
        {
            kind: "withdrawal_network",
            zippedAssetId: 22,
            amount: { baseUnits: "5000", decimals: 9 },
        },
    ],
    quotedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_030_000,
};

const wireQuickSwap = create(Proto.QuickSwapSchema, {
    swapId: 42n,
    idempotencyKey: "order-1",
    status: Proto.QuickSwapStatus.PAYING_OUT,
    reason: Proto.QuickSwapReason.REFUND_BELOW_MINIMUM,
    terms: wireTerms,
    destinationAddress: "So1destination",
    returnAddress: "bc1qreturn",
    refundZippedAssetId: 33,
    refundAddress: "0xrefund",
    quote: wireQuote,
    depositInstructions: {
        address: "bc1qdeposit",
        zippedAssetId: 11,
        issuedAt: ts(1_700_000_001),
        fundingExpiresAt: ts(1_700_604_801),
        addressRetiresAt: ts(1_700_604_801),
        addressState: Proto.DepositAddressState.REFUND_MODE,
    },
    screening: { sourceWallet: "bc1qsender" },
    deposits: [
        {
            index: 0,
            txHash: "deadbeef",
            txOccurrenceIndex: 1n,
            zippedAssetId: 11,
            amount: { baseUnits: "150000000", decimals: 8 },
            disposition: Proto.DepositDisposition.ELIGIBLE,
            confirmations: 3,
            requiredConfirmations: 2,
            detectedAt: ts(1_700_000_100),
            creditedAt: ts(1_700_001_000),
            flowId: "flow_deposit",
        },
    ],
    execution: {
        inputAmount: { baseUnits: "149990000", decimals: 8 },
        executedInput: { baseUnits: "149990000", decimals: 8 },
        outputAmount: { baseUnits: "4090000000", decimals: 9 },
        completedSlices: 1,
        totalSlices: 1,
        startedAt: ts(1_700_001_001),
        deadline: ts(1_700_001_301),
        finishedAt: ts(1_700_001_010),
    },
    withdrawals: [
        {
            index: 0,
            role: Proto.WithdrawalRole.DESTINATION,
            zippedAssetId: 22,
            address: "So1destination",
            state: Proto.WithdrawalState.SUBMITTED,
            submittedAt: ts(1_700_001_020),
            flowId: "flow_withdraw",
        },
    ],
    createdAt: ts(1_700_000_000),
    updatedAt: ts(1_700_001_020),
    version: 7n,
    affiliates: [{ accountId: 9n, sharePpm: 250_000 }],
    feeScheduleVersion: 3n,
});

describe("QuickSwapService", () => {
    it("quotes terms through the authenticated transport", async () => {
        const authApi = unaryTransport(
            create(Proto.QuoteQuickSwapResponseSchema, { quote: wireQuote }),
        );
        const service = new QuickSwapService({ authApi: authApi.transport });
        const signal = new AbortController().signal;

        await expect(service.quote({ terms }, { signal })).resolves.toEqual(quote);

        const call = authApi.lastCall();
        expect(call?.method.parent.typeName).toBe("swap.quickswap.v1.QuickSwapService");
        expect(call?.method.name).toBe("QuoteQuickSwap");
        expect(call?.signal).toBe(signal);
        expect(call?.message).toEqual({
            terms: {
                sourceZippedAssetId: 11,
                destinationZippedAssetId: 22,
                basis: Proto.QuoteBasis.SOURCE_AMOUNT,
                amount: { baseUnits: "150000000", decimals: 8 },
                protection: { bound: { case: "maxSlippageBps", value: 50 } },
                execution: { strategy: { case: "market", value: {} } },
            },
        });
    });

    it("maps a destination-amount TWAP with a minimum output to the contract", async () => {
        const authApi = unaryTransport({ quote: wireQuote });
        const service = new QuickSwapService({ authApi: authApi.transport });

        await service.quote({
            terms: {
                ...terms,
                basis: "destination_amount",
                protection: { kind: "min_amount_out", amount: { baseUnits: "1", decimals: 9 } },
                execution: { type: "twap", durationMs: 3_600_000, sliceIntervalMs: 60_000 },
            },
        });

        expect(authApi.lastCall()?.message).toMatchObject({
            terms: {
                basis: Proto.QuoteBasis.DESTINATION_AMOUNT,
                protection: {
                    bound: { case: "minAmountOut", value: { baseUnits: "1", decimals: 9 } },
                },
                execution: {
                    strategy: {
                        case: "twap",
                        value: { durationMs: 3_600_000n, sliceIntervalMs: 60_000n },
                    },
                },
            },
        });
    });

    it("creates a QuickSwap and returns its full state", async () => {
        const authApi = unaryTransport(
            create(Proto.CreateQuickSwapResponseSchema, { quickSwap: wireQuickSwap }),
        );
        const service = new QuickSwapService({ authApi: authApi.transport });
        const input: CreateQuickSwapInput = {
            idempotencyKey: "order-1",
            terms,
            destinationAddress: " So1destination ",
            returnAddress: "bc1qreturn",
            refund: { zippedAssetId: 33, address: "0xrefund" },
            sourceWallet: "bc1qsender",
            affiliates: [{ accountId: formatId(9n), sharePpm: 250_000 }],
        };

        const quickSwap = await service.create(input);

        expect(authApi.lastCall()?.method.name).toBe("CreateQuickSwap");
        expect(authApi.lastCall()?.message).toEqual({
            idempotencyKey: "order-1",
            terms: expect.objectContaining({ sourceZippedAssetId: 11 }),
            destinationAddress: "So1destination",
            destinationMemo: "",
            returnAddress: "bc1qreturn",
            returnMemo: "",
            refundZippedAssetId: 33,
            refundAddress: "0xrefund",
            refundMemo: "",
            sourceWallet: "bc1qsender",
            affiliates: [{ accountId: 9n, sharePpm: 250_000 }],
        });
        expect(quickSwap).toEqual({
            swapId: formatId(42n),
            idempotencyKey: "order-1",
            status: "paying_out",
            reason: "refund_below_minimum",
            isTerminal: false,
            terms,
            destinationAddress: "So1destination",
            destinationMemo: "",
            returnAddress: "bc1qreturn",
            returnMemo: "",
            refund: { zippedAssetId: 33, address: "0xrefund", memo: "" },
            quote,
            depositInstructions: {
                address: "bc1qdeposit",
                memo: "",
                zippedAssetId: 11,
                issuedAt: 1_700_000_001_000,
                fundingExpiresAt: 1_700_604_801_000,
                addressRetiresAt: 1_700_604_801_000,
                addressState: "refund_mode",
                minNativeGasLimit: "0",
            },
            screening: { sourceWallet: "bc1qsender" },
            deposits: [
                {
                    index: 0,
                    txHash: "deadbeef",
                    txOccurrenceIndex: "1",
                    zippedAssetId: 11,
                    amount: { baseUnits: "150000000", decimals: 8 },
                    disposition: "eligible",
                    reason: "unspecified",
                    confirmations: 3,
                    requiredConfirmations: 2,
                    detectedAt: 1_700_000_100_000,
                    creditedAt: 1_700_001_000_000,
                    flowId: "flow_deposit",
                },
            ],
            depositsTruncated: false,
            execution: {
                inputAmount: { baseUnits: "149990000", decimals: 8 },
                executedInput: { baseUnits: "149990000", decimals: 8 },
                outputAmount: { baseUnits: "4090000000", decimals: 9 },
                intermediateRemainder: undefined,
                completedSlices: 1,
                totalSlices: 1,
                startedAt: 1_700_001_001_000,
                deadline: 1_700_001_301_000,
                finishedAt: 1_700_001_010_000,
            },
            withdrawals: [
                {
                    index: 0,
                    role: "destination",
                    depositIndex: 0,
                    zippedAssetId: 22,
                    address: "So1destination",
                    memo: "",
                    amount: undefined,
                    networkFee: undefined,
                    state: "submitted",
                    txHash: "",
                    submittedAt: 1_700_001_020_000,
                    finalizedAt: undefined,
                    flowId: "flow_withdraw",
                    unsentAmount: undefined,
                },
            ],
            withdrawalsTruncated: false,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_001_020_000,
            terminalAt: undefined,
            version: "7",
            affiliates: [{ accountId: formatId(9n), sharePpm: 250_000 }],
            feeScheduleVersion: "3",
        });
    });

    it("omits the refund target when none was supplied", async () => {
        const authApi = unaryTransport({
            quickSwap: create(Proto.QuickSwapSchema, {
                swapId: 1n,
                status: Proto.QuickSwapStatus.ALLOCATING,
            }),
        });
        const service = new QuickSwapService({ authApi: authApi.transport });

        const quickSwap = await service.create({
            idempotencyKey: "k",
            terms,
            destinationAddress: "d",
            returnAddress: "r",
        });

        expect(authApi.lastCall()?.message).toMatchObject({
            refundZippedAssetId: 0,
            refundAddress: "",
            refundMemo: "",
            sourceWallet: "",
            affiliates: [],
        });
        expect(quickSwap).toMatchObject({ status: "allocating", deposits: [], withdrawals: [] });
        expect(quickSwap.refund).toBeUndefined();
        expect(quickSwap.terms).toBeUndefined();
        expect(quickSwap.depositInstructions).toBeUndefined();
    });

    it("gets a QuickSwap by ID and looks one up by idempotency key", async () => {
        const authApi = unaryTransport({ quickSwap: wireQuickSwap });
        const service = new QuickSwapService({ authApi: authApi.transport });

        await expect(service.get({ swapId: formatId(42n) })).resolves.toMatchObject({
            swapId: formatId(42n),
        });
        expect(authApi.lastCall()?.method.name).toBe("GetQuickSwap");
        expect(authApi.lastCall()?.message).toEqual({
            selector: { case: "swapId", value: 42n },
        });

        await expect(service.lookup({ idempotencyKey: "order-1" })).resolves.toMatchObject({
            idempotencyKey: "order-1",
        });
        expect(authApi.lastCall()?.method.name).toBe("GetQuickSwap");
        expect(authApi.lastCall()?.message).toEqual({
            selector: { case: "idempotencyKey", value: "order-1" },
        });
    });

    it("maps enum values added later to unspecified instead of failing the decode", async () => {
        const authApi = unaryTransport({
            quickSwap: create(Proto.QuickSwapSchema, {
                swapId: 1n,
                status: 99 as Proto.QuickSwapStatus,
                reason: 99 as Proto.QuickSwapReason,
                isTerminal: true,
            }),
        });
        const service = new QuickSwapService({ authApi: authApi.transport });

        await expect(service.get({ swapId: formatId(1n) })).resolves.toMatchObject({
            status: "unspecified",
            reason: "unspecified",
            isTerminal: true,
        });
    });

    it("rejects a response without its QuickSwap", async () => {
        const authApi = unaryTransport({});
        const service = new QuickSwapService({ authApi: authApi.transport });

        await expect(service.lookup({ idempotencyKey: "k" })).rejects.toBeInstanceOf(
            ValidationError,
        );
    });

    const createInput: CreateQuickSwapInput = {
        idempotencyKey: "order-1",
        terms,
        destinationAddress: "d",
        returnAddress: "r",
    };

    it.each([
        { name: "same source and destination", terms: { destinationZippedAssetId: 11 } },
        { name: "zero amount", terms: { amount: { baseUnits: "0", decimals: 8 } } },
        { name: "leading zero amount", terms: { amount: { baseUnits: "01", decimals: 8 } } },
        { name: "decimal amount", terms: { amount: { baseUnits: "1.5", decimals: 8 } } },
        { name: "decimals over 36", terms: { amount: { baseUnits: "1", decimals: 37 } } },
        { name: "slippage of 0 bps", terms: { protection: { kind: "max_slippage", bps: 0 } } },
        {
            name: "slippage over 1000 bps",
            terms: { protection: { kind: "max_slippage", bps: 1001 } },
        },
        {
            name: "zero minimum output",
            terms: {
                protection: { kind: "min_amount_out", amount: { baseUnits: "0", decimals: 9 } },
            },
        },
        {
            name: "TWAP shorter than a minute",
            terms: { execution: { type: "twap", durationMs: 59_999, sliceIntervalMs: 10_000 } },
        },
        {
            name: "TWAP slice longer than the duration",
            terms: { execution: { type: "twap", durationMs: 60_000, sliceIntervalMs: 60_001 } },
        },
        { name: "unknown basis", terms: { basis: "both" } },
    ])("rejects terms with $name before calling the server", async ({ terms: patch }) => {
        const authApi = unaryTransport({ quote: wireQuote });
        const service = new QuickSwapService({ authApi: authApi.transport });

        await expect(
            service.quote({ terms: { ...terms, ...patch } as QuickSwapTermsInput }),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(authApi.calls).toHaveLength(0);
    });

    it.each([
        { name: "empty idempotency key", patch: { idempotencyKey: "" } },
        { name: "idempotency key with spaces", patch: { idempotencyKey: " order-1 " } },
        { name: "idempotency key over 128 characters", patch: { idempotencyKey: "k".repeat(129) } },
        { name: "blank destination address", patch: { destinationAddress: "  " } },
        { name: "return address over 256 bytes", patch: { returnAddress: "é".repeat(129) } },
        { name: "memo over 128 bytes", patch: { returnMemo: "m".repeat(129) } },
        { name: "refund without an address", patch: { refund: { zippedAssetId: 33 } } },
        {
            name: "five affiliates",
            patch: {
                affiliates: Array.from({ length: 5 }, (_, i) => ({
                    accountId: formatId(BigInt(i + 1)),
                    sharePpm: 1,
                })),
            },
        },
        {
            name: "affiliate share over 1000000 ppm",
            patch: { affiliates: [{ accountId: formatId(9n), sharePpm: 1_000_001 }] },
        },
        { name: "unknown key", patch: { refundAddress: "0xrefund" } },
    ])("rejects a create with $name before calling the server", async ({ patch }) => {
        const authApi = unaryTransport({ quickSwap: wireQuickSwap });
        const service = new QuickSwapService({ authApi: authApi.transport });

        await expect(
            service.create({ ...createInput, ...patch } as CreateQuickSwapInput),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(authApi.calls).toHaveLength(0);
    });

    it.each([
        {
            name: "an unset swap ID",
            call: (s: QuickSwapService) => s.get({ swapId: formatId(0n) }),
        },
        {
            name: "an invalid idempotency key",
            call: (s: QuickSwapService) => s.lookup({ idempotencyKey: "a/b" }),
        },
    ])("rejects a read with $name before calling the server", async ({ call }) => {
        const authApi = unaryTransport({ quickSwap: wireQuickSwap });
        const service = new QuickSwapService({ authApi: authApi.transport });

        await expect(call(service)).rejects.toBeInstanceOf(ValidationError);
        expect(authApi.calls).toHaveLength(0);
    });
});
