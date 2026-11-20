import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
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
import { SwapService } from "./swap.js";

const E18 = 10n ** 18n;
const activeSubaccount: SubaccountResolver = { getDefaultSubaccountId: () => formatId(11n) };

const terms = { sourceAssetId: 1, destinationAssetId: 2, amount: "0.5" };
const createInput = {
    ...terms,
    minAmountOut: "0.123456789012345678",
    quoteExpiresAt: 1_700_000_030_123,
    idempotencyKey: "swap-1",
};

const rawSwap = () =>
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
        feeE18: toU128(E18 / 10_000n),
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
            fee: "0.0001",
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
                },
            ],
            createdAt: 1_700_000_001_000,
        });
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
    ])("rejects %s before sending", async (_name, input) => {
        const transport = unaryTransport({ swap: rawSwap() });
        const service = new SwapService({ authApi: transport.transport });
        await expect(service.create(input)).rejects.toBeInstanceOf(ValidationError);
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
