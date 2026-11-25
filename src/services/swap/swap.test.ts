import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/swap/v1/swap_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import {
    AlreadyExistsError,
    PreconditionFailedError,
    ServiceUnavailableError,
    TimeoutError,
    ValidationError,
} from "../../shared/errors.js";
import { rejectingUnaryTransport, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { toU128 } from "../../utils/u128.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { SwapExecutionSchema } from "./swap.schemas.js";
import { SwapService } from "./swap.js";
import {
    SWAP_TWAP_MAX_DURATION_MS,
    SWAP_TWAP_MIN_DURATION_MS,
    SWAP_TWAP_MIN_SLICE_INTERVAL_MS,
} from "./index.js";

const E18 = 10n ** 18n;
const activeSubaccount: SubaccountResolver = { getDefaultSubaccountId: () => formatId(11n) };

const terms = { sourceAssetId: 1, destinationAssetId: 2, amount: "0.5" };
const createInput = {
    ...terms,
    minAmountOut: "0.123456789012345678",
    quoteExpiresAt: 1_700_000_030_123,
    idempotencyKey: "swap-1",
};

const rawSwap = (overrides: Exclude<MessageInitShape<typeof Proto.SwapSchema>, Proto.Swap> = {}) =>
    create(Proto.SwapSchema, {
        swapId: 77n,
        idempotencyKey: "swap-1",
        sourceAssetId: 1,
        destinationAssetId: 2,
        amountE18: toU128(E18 / 2n),
        minAmountOutE18: toU128(123_456_789_012_345_678n),
        status: Proto.SwapStatus.PARTIALLY_COMPLETED,
        reason: Proto.SwapReason.PRICE_PROTECTION,
        isTerminal: true,
        executedAmountE18: toU128(E18 / 4n),
        unspentAmountE18: toU128(E18 / 4n),
        receivedAmountE18: toU128(62n * (E18 / 1000n)),
        legs: [
            {
                leg: 0,
                symbolId: 9,
                side: Proto.Side.SELL,
                spentE18: toU128(E18 / 4n),
                receivedE18: toU128(62n * (E18 / 1000n)),
                feeE18: toU128(E18 / 10_000n),
                feeAssetId: 2,
            },
        ],
        orders: [
            {
                orderId: 0n,
                symbolId: 9,
                side: Proto.Side.SELL,
                status: Proto.SwapOrderStatus.PLACING,
                limitPriceTicks: 245_500_000_000n,
            },
        ],
        createdAt: { seconds: 1_700_000_001n, nanos: 0 },
        ...overrides,
    });

function errorWith(code: Code, detail: MessageInitShape<typeof Proto.ErrorDetailSchema>) {
    return new ConnectError("", code, undefined, [
        { desc: Proto.ErrorDetailSchema, value: create(Proto.ErrorDetailSchema, detail) },
    ]);
}

describe("SwapService", () => {
    it("quotes decimal terms for the active subaccount and returns decimal amounts", async () => {
        const transport = unaryTransport({
            quote: create(Proto.SwapQuoteSchema, {
                terms: {
                    subaccountId: 11n,
                    sourceAssetId: 1,
                    destinationAssetId: 2,
                    amount: { case: "amountE18", value: toU128(E18 / 2n) },
                },
                legs: [
                    {
                        symbolId: 9,
                        side: Proto.Side.SELL,
                        averagePrice: "2455.1",
                        priceImpactBps: 3,
                        takerFeeRatePercent: "0.1",
                        feeE18: toU128(1_227_550_000_000_000_000n),
                        feeAssetId: 2,
                    },
                ],
                expectedAmountOutE18: toU128(1_226_322_450_000_000_000_000n),
                minAmountOutE18: toU128(1n),
                quotedAt: { seconds: 1_700_000_000n, nanos: 0 },
                expiresAt: { seconds: 1_700_000_030n, nanos: 500_000_000 },
            }),
        });
        const service = new SwapService({ authApi: transport.transport }, activeSubaccount);

        const quote = await service.quote({ ...terms, maxSlippageBps: 50 });

        expect(transport.lastCall()?.message).toEqual({
            terms: {
                subaccountId: 11n,
                sourceAssetId: 1,
                destinationAssetId: 2,
                amount: { case: "amountE18", value: toU128(E18 / 2n) },
            },
            maxSlippageBps: 50,
        });
        expect(quote).toEqual({
            subaccountId: formatId(11n),
            sourceAssetId: 1,
            destinationAssetId: 2,
            amount: "0.5",
            legs: [
                {
                    symbolId: 9,
                    side: "sell",
                    averagePrice: "2455.1",
                    priceImpactBps: 3,
                    takerFeeRatePercent: "0.1",
                    fee: "1.22755",
                    feeAssetId: 2,
                },
            ],
            expectedAmountOut: "1226.32245",
            minAmountOut: "0.000000000000000001",
            quotedAt: 1_700_000_000_000,
            expiresAt: 1_700_000_030_500,
            execution: { type: "market" },
            intermediateAssetId: null,
            priceImpactBps: 0,
            totalSlices: 0,
        });
    });

    it("quotes and creates a two-leg TWAP with its execution in the idempotent terms", async () => {
        const twap = { type: "twap", durationMs: 1_800_000, sliceIntervalMs: 60_000 } as const;
        const wireExecution = {
            strategy: {
                case: "twap",
                value: { durationMs: 1_800_000n, sliceIntervalMs: 60_000n },
            },
        } as const;
        const transport = unaryTransport((call) =>
            call.method.name === "QuoteSwap"
                ? {
                      quote: create(Proto.SwapQuoteSchema, {
                          terms: {
                              sourceAssetId: 1,
                              destinationAssetId: 5,
                              amount: { case: "amountE18", value: toU128(E18 / 2n) },
                              execution: wireExecution,
                          },
                          legs: [
                              { symbolId: 9, side: Proto.Side.SELL, feeAssetId: 3 },
                              { symbolId: 12, side: Proto.Side.BUY, feeAssetId: 5 },
                          ],
                          intermediateAssetId: 3,
                          priceImpactBps: 42,
                          totalSlices: 30,
                      }),
                  }
                : { swap: rawSwap() },
        );
        const service = new SwapService({ authApi: transport.transport });

        const quote = await service.quote({
            ...terms,
            destinationAssetId: 5,
            execution: twap,
            maxSlippageBps: 100,
        });
        expect(transport.lastCall()?.message).toMatchObject({
            terms: { destinationAssetId: 5, execution: wireExecution },
        });
        expect(quote).toMatchObject({
            execution: twap,
            intermediateAssetId: 3,
            priceImpactBps: 42,
            totalSlices: 30,
            legs: [{ symbolId: 9 }, { symbolId: 12, side: "buy", feeAssetId: 5 }],
        });

        await service.create({ ...createInput, execution: { type: "market" } });
        expect(transport.lastCall()?.message).toMatchObject({
            terms: { execution: { strategy: { case: "market", value: {} } } },
        });
    });

    it("decodes a two-leg TWAP swap's legs, remainder and slice progress", async () => {
        const transport = unaryTransport({
            swap: rawSwap({
                reason: Proto.SwapReason.INTERMEDIATE_BELOW_MINIMUM,
                execution: {
                    strategy: {
                        case: "twap",
                        value: { durationMs: 120_000n, sliceIntervalMs: 60_000n },
                    },
                },
                intermediateAssetId: 3,
                intermediateRemainderE18: toU128(E18 / 100n),
                orders: [{ orderId: 5n, symbolId: 12, leg: 1, slice: 1 }],
                progress: {
                    completedSlices: 1,
                    totalSlices: 2,
                    startedAt: { seconds: 1_700_000_000n, nanos: 0 },
                    deadline: { seconds: 1_700_000_120n, nanos: 0 },
                    slices: [
                        {
                            index: 0,
                            plannedAt: { seconds: 1_700_000_000n, nanos: 0 },
                            executedAt: { seconds: 1_700_000_001n, nanos: 0 },
                            finishedAt: { seconds: 1_700_000_005n, nanos: 0 },
                            state: Proto.SwapSlice_State.PARTLY_TRADED,
                            completed: true,
                            inputTradedE18: toU128(E18 / 4n),
                            intermediateCarriedE18: toU128(E18 / 100n),
                            carryReason: Proto.SwapSlice_Reason.BELOW_MINIMUM,
                        },
                        {
                            index: 1,
                            plannedAt: { seconds: 1_700_000_060n, nanos: 0 },
                            state: Proto.SwapSlice_State.SKIPPED,
                            reason: Proto.SwapSlice_Reason.SLOT_MISSED,
                        },
                    ],
                },
            }),
        });
        const service = new SwapService({ authApi: transport.transport });

        await expect(service.get({ swapId: formatId(77n) })).resolves.toMatchObject({
            reason: "intermediate_below_minimum",
            execution: { type: "twap", durationMs: 120_000, sliceIntervalMs: 60_000 },
            intermediateAssetId: 3,
            intermediateRemainder: "0.01",
            orders: [{ orderId: formatId(5n), leg: 1, slice: 1 }],
            progress: {
                completedSlices: 1,
                totalSlices: 2,
                startedAt: 1_700_000_000_000,
                deadline: 1_700_000_120_000,
                slicesTruncated: false,
                slices: [
                    {
                        index: 0,
                        plannedAt: 1_700_000_000_000,
                        executedAt: 1_700_000_001_000,
                        finishedAt: 1_700_000_005_000,
                        state: "partly_traded",
                        reason: null,
                        completed: true,
                        inputTraded: "0.25",
                        outputReceived: "0",
                        secondLegInput: "0",
                        intermediateCarried: "0.01",
                        carryReason: "below_minimum",
                    },
                    {
                        index: 1,
                        plannedAt: 1_700_000_060_000,
                        executedAt: null,
                        finishedAt: null,
                        state: "skipped",
                        reason: "slot_missed",
                        completed: false,
                        inputTraded: "0",
                        outputReceived: "0",
                        secondLegInput: "0",
                        intermediateCarried: "0",
                        carryReason: null,
                    },
                ],
            },
        });
    });

    it("leaves the subaccount to the server for the main account", async () => {
        const transport = unaryTransport({ swap: rawSwap() });
        const service = new SwapService({ authApi: transport.transport }, activeSubaccount);

        await service.create({ ...createInput, account: "main" });

        expect(transport.lastCall()?.message).toEqual({
            idempotencyKey: "swap-1",
            terms: {
                sourceAssetId: 1,
                destinationAssetId: 2,
                amount: { case: "amountE18", value: toU128(E18 / 2n) },
            },
            minAmountOutE18: toU128(123_456_789_012_345_678n),
            quoteExpiresAt: { seconds: 1_700_000_030n, nanos: 123_000_000 },
        });
    });

    it("reads a swap by idempotency key with its outcome as decimals", async () => {
        const transport = unaryTransport({ swap: rawSwap() });
        const service = new SwapService({ authApi: transport.transport });

        const swap = await service.get({ idempotencyKey: "swap-1" });

        expect(transport.lastCall()?.message).toEqual({
            selector: { case: "idempotencyKey", value: "swap-1" },
        });
        expect(swap).toEqual({
            swapId: formatId(77n),
            idempotencyKey: "swap-1",
            subaccountId: null,
            sourceAssetId: 1,
            destinationAssetId: 2,
            amount: "0.5",
            minAmountOut: "0.123456789012345678",
            status: "partially_completed",
            reason: "price_protection",
            isTerminal: true,
            executedAmount: "0.25",
            unspentAmount: "0.25",
            receivedAmount: "0.062",
            orders: [
                {
                    orderId: null,
                    symbolId: 9,
                    side: "sell",
                    leg: 0,
                    status: "placing",
                    limitPrice: "245.5",
                    spent: "0",
                    received: "0",
                    fee: "0",
                    slice: 0,
                },
            ],
            createdAt: 1_700_000_001_000,
            execution: { type: "market" },
            intermediateAssetId: null,
            intermediateRemainder: "0",
            legs: [
                {
                    leg: 0,
                    symbolId: 9,
                    side: "sell",
                    spent: "0.25",
                    received: "0.062",
                    fee: "0.0001",
                    feeAssetId: 2,
                },
            ],
            progress: null,
            cancelRequestedAt: null,
        });
    });

    it("cancels a swap, decodes cancel state and slice reason, and retries unknown outcomes", async () => {
        const canceledSwap = rawSwap({
            status: Proto.SwapStatus.CANCELED,
            reason: Proto.SwapReason.USER_CANCELED,
            isTerminal: true,
            cancelRequestedAt: { seconds: 1_700_000_050n, nanos: 250_000_000 },
            progress: {
                completedSlices: 0,
                totalSlices: 2,
                slices: [
                    {
                        index: 1,
                        state: Proto.SwapSlice_State.SKIPPED,
                        reason: Proto.SwapSlice_Reason.CANCELED,
                    },
                ],
            },
        });
        const transport = unaryTransport((_call, index) => {
            if (index === 0) throw new ConnectError("deadline", Code.DeadlineExceeded);
            return { swap: canceledSwap };
        });
        const service = new SwapService({
            authApi: createErrorMappingTransport(transport.transport),
        });

        const first = service.cancel({ swapId: formatId(77n) });
        await expect(first).rejects.toBeInstanceOf(TimeoutError);
        await expect(first).rejects.toMatchObject({ retryable: true });

        const swap = await service.cancel({ swapId: formatId(77n) });
        expect(transport.lastCall()?.method.localName).toBe("cancelSwap");
        expect(transport.lastCall()?.message).toEqual({ swapId: 77n });
        expect(swap).toMatchObject({
            status: "canceled",
            reason: "user_canceled",
            isTerminal: true,
            cancelRequestedAt: 1_700_000_050_250,
            progress: {
                slices: [{ index: 1, state: "skipped", reason: "canceled" }],
            },
        });
    });

    it("decodes a canceling swap as non-terminal with cancelRequestedAt", async () => {
        const transport = unaryTransport({
            swap: rawSwap({
                status: Proto.SwapStatus.CANCELING,
                reason: Proto.SwapReason.REASON_UNSPECIFIED,
                isTerminal: false,
                cancelRequestedAt: { seconds: 1_700_000_050n, nanos: 0 },
            }),
        });
        const service = new SwapService({ authApi: transport.transport });

        await expect(service.cancel({ swapId: formatId(77n) })).resolves.toMatchObject({
            status: "canceling",
            reason: null,
            isTerminal: false,
            cancelRequestedAt: 1_700_000_050_000,
        });
    });

    it("lists swaps for the resolved account with openOnly and pagination", async () => {
        const transport = unaryTransport({
            swaps: [rawSwap()],
            nextPageToken: "next-cursor",
        });
        const service = new SwapService({ authApi: transport.transport }, activeSubaccount);

        const page = await service.list({ openOnly: true, limit: 25, pageToken: " cursor-1 " });

        expect(transport.lastCall()?.method.localName).toBe("listSwaps");
        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 11n,
            openOnly: true,
            limit: 25,
            pageToken: "cursor-1",
        });
        expect(page).toMatchObject({
            swaps: [{ swapId: formatId(77n), cancelRequestedAt: null }],
            nextPageToken: "next-cursor",
        });

        await service.list({ account: "main" });
        expect(transport.lastCall()?.message).toEqual({});
    });

    it.each([
        ["negative limit", { limit: -1 }],
        ["limit over 50", { limit: 51 }],
        ["fractional limit", { limit: 10.5 }],
        ["unknown field", { extra: true }],
    ])("rejects list input with %s before sending", async (_name, input) => {
        const transport = unaryTransport({ swaps: [], nextPageToken: "" });
        const service = new SwapService({ authApi: transport.transport });
        await expect(service.list(input as never)).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });

    it("rejects malformed cancel swapId before sending", async () => {
        const transport = unaryTransport({ swap: rawSwap() });
        const service = new SwapService({ authApi: transport.transport });
        await expect(service.cancel({ swapId: "" })).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });

    it("settles an unknown create outcome by resending the same request", async () => {
        const transport = unaryTransport((_call, index) => {
            if (index === 0) throw new ConnectError("deadline", Code.DeadlineExceeded);
            return { swap: rawSwap() };
        });
        const service = new SwapService({
            authApi: createErrorMappingTransport(transport.transport),
        });

        const first = service.create(createInput);
        await expect(first).rejects.toBeInstanceOf(TimeoutError);
        await expect(first).rejects.toMatchObject({ retryable: true });
        await expect(service.create(createInput)).resolves.toMatchObject({
            swapId: formatId(77n),
        });
        expect(transport.calls[1]?.message).toEqual(transport.calls[0]?.message);
    });

    it.each([
        ["more than 18 decimals", { ...createInput, amount: "0.0000000000000000001" }],
        ["a zero amount", { ...createInput, amount: "0" }],
        ["a zero minimum", { ...createInput, minAmountOut: "0" }],
        ["a non-decimal amount", { ...createInput, amount: "1e3" }],
        [
            "a fractional TWAP duration",
            {
                ...createInput,
                execution: { type: "twap", durationMs: 60_000.5, sliceIntervalMs: 10_000 },
            },
        ],
        [
            "a TWAP without its slice interval",
            { ...createInput, execution: { type: "twap", durationMs: 60_000 } },
        ],
        ["an unknown execution", { ...createInput, execution: { type: "limit" } }],
    ])("rejects %s before sending", async (_name, input) => {
        const transport = unaryTransport({ swap: rawSwap() });
        const service = new SwapService({ authApi: transport.transport });
        await expect(service.create(input as never)).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });

    it.each([
        [
            Code.AlreadyExists,
            { code: Proto.ErrorCode.IDEMPOTENCY_CONFLICT, swapId: 77n },
            AlreadyExistsError,
            { service: "swap", code: "IDEMPOTENCY_CONFLICT", swapId: formatId(77n) },
        ],
        [
            Code.InvalidArgument,
            {
                code: Proto.ErrorCode.AMOUNT_OUT_OF_RANGE,
                minAmountE18: toU128(E18 / 1000n),
                maxAmountE18: toU128(25n * E18),
            },
            ValidationError,
            { service: "swap", code: "AMOUNT_OUT_OF_RANGE", minAmount: "0.001", maxAmount: "25" },
        ],
        [
            Code.FailedPrecondition,
            { code: Proto.ErrorCode.QUOTE_EXPIRED },
            PreconditionFailedError,
            { service: "swap", code: "QUOTE_EXPIRED" },
        ],
        [
            Code.FailedPrecondition,
            { code: Proto.ErrorCode.SWAP_ALREADY_FINAL, swapId: 77n },
            PreconditionFailedError,
            { service: "swap", code: "SWAP_ALREADY_FINAL", swapId: formatId(77n) },
        ],
        [
            Code.FailedPrecondition,
            { code: Proto.ErrorCode.SWAP_NOT_CANCELABLE },
            PreconditionFailedError,
            { service: "swap", code: "SWAP_NOT_CANCELABLE" },
        ],
        [
            Code.Unavailable,
            { code: Proto.ErrorCode.SERVICE_UNAVAILABLE },
            ServiceUnavailableError,
            { service: "swap", code: "SERVICE_UNAVAILABLE" },
        ],
    ])("maps %s with its swap detail", async (code, detail, type, mapped) => {
        const service = new SwapService({
            authApi: createErrorMappingTransport(rejectingUnaryTransport(errorWith(code, detail))),
        });
        const rejected = service.create(createInput);
        await expect(rejected).rejects.toBeInstanceOf(type);
        await expect(rejected).rejects.toMatchObject({ detail: mapped });
    });
});

describe("SwapExecutionSchema", () => {
    it("reads a strategy this build doesn't know as unspecified, never as market", () => {
        expect(v.parse(SwapExecutionSchema, { strategy: { case: undefined } })).toEqual({
            type: "unspecified",
        });
        expect(v.parse(SwapExecutionSchema, undefined)).toBeUndefined();
    });

    it("exports TWAP duration and slice interval bounds", () => {
        expect(SWAP_TWAP_MIN_DURATION_MS).toBe(60_000);
        expect(SWAP_TWAP_MAX_DURATION_MS).toBe(86_400_000);
        expect(SWAP_TWAP_MIN_SLICE_INTERVAL_MS).toBe(10_000);
    });
});
