import type { MessageInitShape } from "@bufbuild/protobuf";
import * as v from "valibot";
import type { ExecutionSchema } from "../../gen/swap/quickswap/v1/quickswap_pb.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    BigIntStringSchema,
    idInputSchema,
    OptionalTimestampMsSchema,
    PublicIdSchema,
} from "../../shared/schemas.js";
import { PositiveUint32InputSchema } from "../shared.js";
import {
    QUICKSWAP_BASIS_VALUES,
    QuickSwapBasisCodec,
    QuickSwapDepositAddressStateCodec,
    QuickSwapDepositDispositionCodec,
    QuickSwapFeeKindCodec,
    QuickSwapReasonCodec,
    QuickSwapStatusCodec,
    QuickSwapWithdrawalRoleCodec,
    QuickSwapWithdrawalStateCodec,
} from "./quickswap.codecs.js";

// Input rules mirror the contract's own validation, so malformed requests fail
// before they reach the network.

const TokenAmountInputSchema = v.strictObject({
    baseUnits: v.pipe(
        v.string(),
        v.regex(
            /^(0|[1-9][0-9]{0,77})$/u,
            "baseUnits must be an unsigned integer without sign, exponent, separators or leading zeros, at most 78 digits",
        ),
    ),
    decimals: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(36)),
});

const PositiveTokenAmountInputSchema = v.pipe(
    TokenAmountInputSchema,
    v.check((amount) => amount.baseUnits !== "0", "amount must be positive"),
);

const ProtectionInputSchema = v.variant("kind", [
    v.strictObject({
        kind: v.literal("max_slippage"),
        bps: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000)),
    }),
    v.strictObject({
        kind: v.literal("min_amount_out"),
        amount: PositiveTokenAmountInputSchema,
    }),
]);

const ExecutionInputSchema = v.variant("type", [
    v.strictObject({ type: v.literal("market") }),
    v.pipe(
        v.strictObject({
            type: v.literal("twap"),
            durationMs: v.pipe(v.number(), v.integer(), v.minValue(60_000), v.maxValue(86_400_000)),
            sliceIntervalMs: v.pipe(v.number(), v.integer(), v.minValue(10_000)),
        }),
        v.check(
            (execution) => execution.sliceIntervalMs <= execution.durationMs,
            "sliceIntervalMs must not exceed durationMs",
        ),
    ),
]);

function executionToProto(
    execution: v.InferOutput<typeof ExecutionInputSchema>,
): MessageInitShape<typeof ExecutionSchema> {
    if (execution.type === "market") return { strategy: { case: "market", value: {} } };
    return {
        strategy: {
            case: "twap",
            value: {
                durationMs: BigInt(execution.durationMs),
                sliceIntervalMs: BigInt(execution.sliceIntervalMs),
            },
        },
    };
}

export const QuickSwapTermsInputSchema = v.pipe(
    v.strictObject({
        sourceZippedAssetId: PositiveUint32InputSchema,
        destinationZippedAssetId: PositiveUint32InputSchema,
        basis: v.picklist(QUICKSWAP_BASIS_VALUES),
        amount: PositiveTokenAmountInputSchema,
        protection: ProtectionInputSchema,
        execution: ExecutionInputSchema,
    }),
    v.check(
        (terms) => terms.sourceZippedAssetId !== terms.destinationZippedAssetId,
        "source and destination must differ",
    ),
    v.transform((terms) => ({
        sourceZippedAssetId: terms.sourceZippedAssetId,
        destinationZippedAssetId: terms.destinationZippedAssetId,
        basis: QuickSwapBasisCodec.inputToProto[terms.basis],
        amount: terms.amount,
        protection: {
            bound:
                terms.protection.kind === "max_slippage"
                    ? { case: "maxSlippageBps" as const, value: terms.protection.bps }
                    : { case: "minAmountOut" as const, value: terms.protection.amount },
        },
        execution: executionToProto(terms.execution),
    })),
);

export type QuickSwapTermsInput = v.InferInput<typeof QuickSwapTermsInputSchema>;

export const QuoteQuickSwapInputSchema = v.strictObject({ terms: QuickSwapTermsInputSchema });

export type QuoteQuickSwapInput = v.InferInput<typeof QuoteQuickSwapInputSchema>;

const IdempotencyKeyInputSchema = v.pipe(
    v.string(),
    v.regex(
        /^[A-Za-z0-9._:-]{1,128}$/u,
        "idempotencyKey must be 1 to 128 letters, digits, '.', '_', ':' or '-'",
    ),
);

const AddressInputSchema = v.pipe(v.string(), v.trim(), v.minBytes(1), v.maxBytes(256));
const MemoInputSchema = v.optional(v.pipe(v.string(), v.maxBytes(128)), "");

const AffiliateShareInputSchema = v.strictObject({
    accountId: v.pipe(
        idInputSchema("accountId"),
        v.check((accountId) => accountId > 0n, "accountId must be set"),
    ),
    sharePpm: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1_000_000)),
});

export const CreateQuickSwapInputSchema = v.pipe(
    v.strictObject({
        idempotencyKey: IdempotencyKeyInputSchema,
        terms: QuickSwapTermsInputSchema,
        destinationAddress: AddressInputSchema,
        destinationMemo: MemoInputSchema,
        returnAddress: AddressInputSchema,
        returnMemo: MemoInputSchema,
        refund: v.optional(
            v.strictObject({
                zippedAssetId: PositiveUint32InputSchema,
                address: AddressInputSchema,
                memo: MemoInputSchema,
            }),
        ),
        sourceWallet: v.optional(v.pipe(v.string(), v.trim(), v.maxBytes(256)), ""),
        affiliates: v.optional(v.pipe(v.array(AffiliateShareInputSchema), v.maxLength(4)), []),
    }),
    v.transform(({ refund, ...input }) => ({
        ...input,
        refundZippedAssetId: refund?.zippedAssetId ?? 0,
        refundAddress: refund?.address ?? "",
        refundMemo: refund?.memo ?? "",
    })),
);

export type CreateQuickSwapInput = v.InferInput<typeof CreateQuickSwapInputSchema>;

export const GetQuickSwapInputSchema = v.pipe(
    v.strictObject({ swapId: idInputSchema("swapId") }),
    v.check((input) => input.swapId > 0n, "swapId must be set"),
    v.transform((input) => ({ selector: { case: "swapId" as const, value: input.swapId } })),
);

export type GetQuickSwapInput = v.InferInput<typeof GetQuickSwapInputSchema>;

export const LookupQuickSwapInputSchema = v.pipe(
    v.strictObject({ idempotencyKey: IdempotencyKeyInputSchema }),
    v.transform((input) => ({
        selector: { case: "idempotencyKey" as const, value: input.idempotencyKey },
    })),
);

export type LookupQuickSwapInput = v.InferInput<typeof LookupQuickSwapInputSchema>;

// Outputs. Amounts stay exact base-unit strings; timestamps are Unix milliseconds.

const TokenAmountSchema = v.object({
    baseUnits: v.string(),
    decimals: v.number(),
});

export type QuickSwapTokenAmount = v.InferOutput<typeof TokenAmountSchema>;

const OptionalTokenAmountSchema = v.optional(TokenAmountSchema);

const ProtectionRawSchema = v.variant("case", [
    v.object({ case: v.literal("maxSlippageBps"), value: v.number() }),
    v.object({ case: v.literal("minAmountOut"), value: TokenAmountSchema }),
    v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
]);

const ExecutionRawSchema = v.variant("case", [
    v.object({ case: v.literal("market"), value: v.object({}) }),
    v.object({
        case: v.literal("twap"),
        value: v.object({ durationMs: v.bigint(), sliceIntervalMs: v.bigint() }),
    }),
    v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
]);

const QuickSwapTermsSchema = v.pipe(
    v.object({
        sourceZippedAssetId: v.number(),
        destinationZippedAssetId: v.number(),
        basis: enumLabelSchema(QuickSwapBasisCodec.protoToOutput),
        amount: OptionalTokenAmountSchema,
        protection: v.optional(v.object({ bound: ProtectionRawSchema })),
        execution: v.optional(v.object({ strategy: ExecutionRawSchema })),
    }),
    v.transform(({ protection, execution, ...terms }) => ({
        ...terms,
        protection:
            protection?.bound.case === "maxSlippageBps"
                ? { kind: "max_slippage" as const, bps: protection.bound.value }
                : protection?.bound.case === "minAmountOut"
                  ? { kind: "min_amount_out" as const, amount: protection.bound.value }
                  : undefined,
        execution:
            execution?.strategy.case === "market"
                ? { type: "market" as const }
                : execution?.strategy.case === "twap"
                  ? {
                        type: "twap" as const,
                        durationMs: Number(execution.strategy.value.durationMs),
                        sliceIntervalMs: Number(execution.strategy.value.sliceIntervalMs),
                    }
                  : undefined,
    })),
);

export type QuickSwapTerms = v.InferOutput<typeof QuickSwapTermsSchema>;

const QuoteFeeSchema = v.object({
    kind: enumLabelSchema(QuickSwapFeeKindCodec.protoToOutput),
    zippedAssetId: v.number(),
    amount: OptionalTokenAmountSchema,
});

export type QuickSwapQuoteFee = v.InferOutput<typeof QuoteFeeSchema>;

export const QuickSwapQuoteSchema = v.object({
    depositAmount: OptionalTokenAmountSchema,
    expectedAmountOut: OptionalTokenAmountSchema,
    minAmountOut: OptionalTokenAmountSchema,
    minRate: v.string(),
    minDepositAmount: OptionalTokenAmountSchema,
    maxDepositAmount: OptionalTokenAmountSchema,
    intermediateAssetId: v.number(),
    fees: v.optional(v.array(QuoteFeeSchema), []),
    quotedAt: OptionalTimestampMsSchema,
    expiresAt: OptionalTimestampMsSchema,
});

export type QuickSwapQuote = v.InferOutput<typeof QuickSwapQuoteSchema>;

const DepositInstructionsSchema = v.object({
    address: v.string(),
    memo: v.string(),
    zippedAssetId: v.number(),
    issuedAt: OptionalTimestampMsSchema,
    fundingExpiresAt: OptionalTimestampMsSchema,
    addressRetiresAt: OptionalTimestampMsSchema,
    addressState: enumLabelSchema(QuickSwapDepositAddressStateCodec.protoToOutput),
    minNativeGasLimit: BigIntStringSchema,
});

export type QuickSwapDepositInstructions = v.InferOutput<typeof DepositInstructionsSchema>;

const DepositSchema = v.object({
    index: v.number(),
    txHash: v.string(),
    txOccurrenceIndex: BigIntStringSchema,
    zippedAssetId: v.number(),
    amount: OptionalTokenAmountSchema,
    disposition: enumLabelSchema(QuickSwapDepositDispositionCodec.protoToOutput),
    reason: enumLabelSchema(QuickSwapReasonCodec.protoToOutput),
    confirmations: v.number(),
    requiredConfirmations: v.number(),
    detectedAt: OptionalTimestampMsSchema,
    creditedAt: OptionalTimestampMsSchema,
    flowId: v.string(),
});

export type QuickSwapDeposit = v.InferOutput<typeof DepositSchema>;

const ExecutionProgressSchema = v.object({
    inputAmount: OptionalTokenAmountSchema,
    executedInput: OptionalTokenAmountSchema,
    outputAmount: OptionalTokenAmountSchema,
    intermediateRemainder: OptionalTokenAmountSchema,
    completedSlices: v.number(),
    totalSlices: v.number(),
    startedAt: OptionalTimestampMsSchema,
    deadline: OptionalTimestampMsSchema,
    finishedAt: OptionalTimestampMsSchema,
});

export type QuickSwapExecutionProgress = v.InferOutput<typeof ExecutionProgressSchema>;

const WithdrawalSchema = v.object({
    index: v.number(),
    role: enumLabelSchema(QuickSwapWithdrawalRoleCodec.protoToOutput),
    depositIndex: v.number(),
    zippedAssetId: v.number(),
    address: v.string(),
    memo: v.string(),
    amount: OptionalTokenAmountSchema,
    networkFee: OptionalTokenAmountSchema,
    state: enumLabelSchema(QuickSwapWithdrawalStateCodec.protoToOutput),
    txHash: v.string(),
    submittedAt: OptionalTimestampMsSchema,
    finalizedAt: OptionalTimestampMsSchema,
    flowId: v.string(),
    unsentAmount: OptionalTokenAmountSchema,
});

export type QuickSwapWithdrawal = v.InferOutput<typeof WithdrawalSchema>;

const AffiliateShareSchema = v.object({
    accountId: PublicIdSchema,
    sharePpm: v.number(),
});

export type QuickSwapAffiliateShare = v.InferOutput<typeof AffiliateShareSchema>;

export const QuickSwapSchema = v.pipe(
    v.object({
        swapId: PublicIdSchema,
        idempotencyKey: v.string(),
        status: enumLabelSchema(QuickSwapStatusCodec.protoToOutput),
        reason: enumLabelSchema(QuickSwapReasonCodec.protoToOutput),
        isTerminal: v.boolean(),
        terms: v.optional(QuickSwapTermsSchema),
        destinationAddress: v.string(),
        destinationMemo: v.string(),
        returnAddress: v.string(),
        returnMemo: v.string(),
        refundZippedAssetId: v.number(),
        refundAddress: v.string(),
        refundMemo: v.string(),
        quote: v.optional(QuickSwapQuoteSchema),
        depositInstructions: v.optional(DepositInstructionsSchema),
        screening: v.optional(v.object({ sourceWallet: v.string() })),
        deposits: v.optional(v.array(DepositSchema), []),
        depositsTruncated: v.boolean(),
        execution: v.optional(ExecutionProgressSchema),
        withdrawals: v.optional(v.array(WithdrawalSchema), []),
        withdrawalsTruncated: v.boolean(),
        createdAt: OptionalTimestampMsSchema,
        updatedAt: OptionalTimestampMsSchema,
        terminalAt: OptionalTimestampMsSchema,
        version: BigIntStringSchema,
        affiliates: v.optional(v.array(AffiliateShareSchema), []),
        feeScheduleVersion: BigIntStringSchema,
    }),
    v.transform(({ refundZippedAssetId, refundAddress, refundMemo, ...quickSwap }) => ({
        ...quickSwap,
        refund: refundAddress
            ? { zippedAssetId: refundZippedAssetId, address: refundAddress, memo: refundMemo }
            : undefined,
    })),
);

export type QuickSwap = v.InferOutput<typeof QuickSwapSchema>;

export const QuoteQuickSwapResultSchema = v.object({ quote: QuickSwapQuoteSchema });

export const QuickSwapResultSchema = v.object({ quickSwap: QuickSwapSchema });
