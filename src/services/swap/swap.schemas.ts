import type { MessageInitShape } from "@bufbuild/protobuf";
import * as v from "valibot";
import type * as Proto from "../../gen/swap/v1/swap_pb.js";
import { PRICE_SCALE } from "../../catalogs/readers.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
    type AccountScope,
} from "../../shared/account-scope.js";
import {
    E18_SCALE,
    decimalInputToE18,
    scaledToDecimalOutput,
} from "../../shared/decimal-surface.js";
import { enumLabel, enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    idInputSchema,
    OptionalPublicIdSchema,
    OptionalTimestampMsSchema,
    PublicIdSchema,
    U128Schema,
} from "../../shared/schemas.js";
import { formatId } from "../../utils/base58-id.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { msToTimestamp } from "../../utils/timestamp.js";
import { fromU128, toU128, type U128Value } from "../../utils/u128.js";
import { PositiveUint32InputSchema } from "../shared.js";
import {
    SwapOrderStatusCodec,
    SwapReasonCodec,
    SwapSideCodec,
    SwapSliceReasonCodec,
    SwapSliceStateCodec,
    SwapStatusCodec,
} from "./swap.codecs.js";

// Sent exactly as given: trimming would make " k " and "k" the same idempotency key.
const IdempotencyKeySchema = v.pipe(v.string(), v.minLength(1));

/** Positive decimal string → wire U128 in 18-decimal units. */
function e18AmountInputSchema(field: string) {
    return v.pipe(
        v.string(),
        v.transform((value) => decimalInputToE18(field, value)),
        v.check((scaled) => scaled > 0n, `${field} must be greater than 0`),
        v.transform(toU128),
    );
}

const MillisecondsInputSchema = v.pipe(v.number(), v.safeInteger(), v.gtValue(0));

/**
 * `market` trades at once; `twap` spreads the swap evenly over `durationMs` (1 to 60 minutes) in
 * slices `sliceIntervalMs` apart (at least 10 seconds, at most `durationMs`). Each slice nets at
 * least the swap's minimum rate on what it converts, except an order accepted late under severe
 * delay, which ends the swap with `minimum_not_met`. A TWAP needs a larger amount than a market
 * swap, since every slice must be a valid order.
 */
export const SwapExecutionInputSchema = v.pipe(
    v.variant("type", [
        v.strictObject({ type: v.literal("market") }),
        v.strictObject({
            type: v.literal("twap"),
            durationMs: MillisecondsInputSchema,
            sliceIntervalMs: MillisecondsInputSchema,
        }),
    ]),
    v.transform(
        (execution): MessageInitShape<typeof Proto.ExecutionSchema> => ({
            strategy:
                execution.type === "market"
                    ? { case: "market", value: {} }
                    : {
                          case: "twap",
                          value: {
                              durationMs: BigInt(execution.durationMs),
                              sliceIntervalMs: BigInt(execution.sliceIntervalMs),
                          },
                      },
        }),
    ),
);

/** How a swap executes. Input and output share this shape. */
export type SwapExecution = v.InferInput<typeof SwapExecutionInputSchema>;

const SwapTermsInputEntries = {
    /** Defaults to the active subaccount, else the root account (or an API key's bound subaccount). */
    ...AccountScopeInputEntries,
    /** Unified asset ID spent, as in balances and internal transfers. */
    sourceAssetId: PositiveUint32InputSchema,
    /** Unified asset ID received. */
    destinationAssetId: PositiveUint32InputSchema,
    /**
     * Source amount to spend, as a decimal string (up to 18 decimal places). Only whole order
     * steps of the market trade; the rest stays on the account.
     */
    amount: e18AmountInputSchema("amount"),
    /** Omit for `market`. Part of the idempotent terms: quote and create with the same one. */
    execution: v.optional(SwapExecutionInputSchema),
};

type SwapTermsInput = {
    account?: AccountScope;
    sourceAssetId: number;
    destinationAssetId: number;
    amount: U128Value;
    execution?: MessageInitShape<typeof Proto.ExecutionSchema>;
};

function toTerms({
    account,
    sourceAssetId,
    destinationAssetId,
    amount,
    execution,
}: SwapTermsInput) {
    return removeUndefined({
        subaccountId: accountScopeToSubaccountId(account),
        sourceAssetId,
        destinationAssetId,
        amount: { case: "amountE18" as const, value: amount },
        execution,
    }) satisfies MessageInitShape<typeof Proto.SwapTermsSchema>;
}

export const QuoteSwapInputSchema = v.pipe(
    v.strictObject({
        ...SwapTermsInputEntries,
        /** Accepted shortfall from the expected output, in basis points (1 to 1000). */
        maxSlippageBps: PositiveUint32InputSchema,
    }),
    v.transform(
        ({ maxSlippageBps, ...terms }) =>
            ({
                terms: toTerms(terms),
                maxSlippageBps,
            }) satisfies MessageInitShape<typeof Proto.QuoteSwapRequestSchema>,
    ),
);

export type QuoteSwapInput = v.InferInput<typeof QuoteSwapInputSchema>;

export const CreateSwapInputSchema = v.pipe(
    v.strictObject({
        ...SwapTermsInputEntries,
        /**
         * Minimum destination amount after fees for the whole amount, as a decimal string;
         * usually the quote's `minAmountOut`.
         */
        minAmountOut: e18AmountInputSchema("minAmountOut"),
        /** The accepted quote's `expiresAt` (epoch ms). Refused with `QUOTE_EXPIRED` after it. */
        quoteExpiresAt: v.pipe(v.number(), v.safeInteger(), v.gtValue(0)),
        /**
         * Caller-chosen key, unique per caller. The same key and request return the same swap;
         * the same key with a different request is `IDEMPOTENCY_CONFLICT`. Keys starting `aw:`
         * are reserved for auto-withdraw conversions and refused.
         */
        idempotencyKey: IdempotencyKeySchema,
    }),
    v.transform(
        ({ minAmountOut, quoteExpiresAt, idempotencyKey, ...terms }) =>
            ({
                idempotencyKey,
                terms: toTerms(terms),
                minAmountOutE18: minAmountOut,
                quoteExpiresAt: msToTimestamp(quoteExpiresAt),
            }) satisfies MessageInitShape<typeof Proto.CreateSwapRequestSchema>,
    ),
);

export type CreateSwapInput = v.InferInput<typeof CreateSwapInputSchema>;

export const GetSwapInputSchema = v.pipe(
    v.union([
        v.strictObject({ swapId: idInputSchema("swapId") }),
        v.strictObject({ idempotencyKey: IdempotencyKeySchema }),
    ]),
    v.transform(
        (input) =>
            ({
                selector:
                    "swapId" in input
                        ? { case: "swapId", value: input.swapId }
                        : { case: "idempotencyKey", value: input.idempotencyKey },
            }) satisfies MessageInitShape<typeof Proto.GetSwapRequestSchema>,
    ),
);

/** Select a swap by `swapId`, or by the `idempotencyKey` it was created with. */
export type GetSwapInput = v.InferInput<typeof GetSwapInputSchema>;

/** Wire `*_e18` U128 → exact decimal string; an unset amount is `"0"`. */
function e18ToDecimal(value: U128Value | undefined): string {
    return scaledToDecimalOutput(fromU128(value), E18_SCALE);
}

const AmountE18Schema = v.optional(U128Schema);

/** An execution as read back: `unspecified` is a strategy this SDK build does not know. */
export type SwapExecutionOutput = SwapExecution | { type: "unspecified" };

/**
 * Wire `Execution` → {@link SwapExecutionOutput}; `undefined` only when unset, so callers apply
 * the field's own unset meaning with `??`.
 */
export const SwapExecutionSchema = v.pipe(
    v.optional(
        v.object({
            strategy: v.variant("case", [
                v.object({ case: v.literal("market") }),
                v.object({
                    case: v.literal("twap"),
                    value: v.object({ durationMs: v.bigint(), sliceIntervalMs: v.bigint() }),
                }),
                v.object({ case: v.undefined() }),
            ]),
        }),
    ),
    v.transform((execution): SwapExecutionOutput | undefined => {
        if (!execution) return undefined;
        const strategy = execution.strategy;
        if (strategy.case === "market") return { type: "market" };
        if (strategy?.case === "twap") {
            return {
                type: "twap",
                durationMs: Number(strategy.value.durationMs),
                sliceIntervalMs: Number(strategy.value.sliceIntervalMs),
            };
        }
        return { type: "unspecified" };
    }),
);

/** Unset terms execute at market. */
const marketExecution = (): SwapExecutionOutput => ({ type: "market" });

/** Zero (a direct route) → `null`. */
const IntermediateAssetIdSchema = v.pipe(
    v.optional(v.number(), 0),
    v.transform((id) => (id === 0 ? null : id)),
);

/** Root account is `null`. */
const SubaccountIdOutputSchema = v.pipe(
    OptionalPublicIdSchema,
    v.transform((id) => id ?? null),
);

export const SwapQuoteLegSchema = v.pipe(
    v.object({
        symbolId: v.number(),
        side: enumLabelSchema(SwapSideCodec.protoToOutput),
        averagePrice: v.string(),
        priceImpactBps: v.number(),
        takerFeeRatePercent: v.string(),
        feeE18: AmountE18Schema,
        feeAssetId: v.number(),
    }),
    v.transform(({ feeE18, ...leg }) => ({
        symbolId: leg.symbolId,
        side: leg.side,
        /** Estimated average fill price, quote per base, for display. */
        averagePrice: leg.averagePrice,
        /** Distance of `averagePrice` from the best price, in bps, rounded up. */
        priceImpactBps: leg.priceImpactBps,
        /** The account's spot taker fee rate in percent, e.g. `"0.1"`. */
        takerFeeRatePercent: leg.takerFeeRatePercent,
        /** Estimated fee, in `feeAssetId` (the asset the leg receives). */
        fee: e18ToDecimal(feeE18),
        feeAssetId: leg.feeAssetId,
    })),
);

export type SwapQuoteLeg = v.InferOutput<typeof SwapQuoteLegSchema>;

const SwapTermsOutputSchema = v.object({
    subaccountId: v.bigint(),
    sourceAssetId: v.number(),
    destinationAssetId: v.number(),
    amount: v.object({ case: v.literal("amountE18"), value: U128Schema }),
    execution: SwapExecutionSchema,
});

export const SwapQuoteSchema = v.pipe(
    v.object({
        terms: SwapTermsOutputSchema,
        legs: v.array(SwapQuoteLegSchema),
        expectedAmountOutE18: AmountE18Schema,
        minAmountOutE18: AmountE18Schema,
        quotedAt: OptionalTimestampMsSchema,
        expiresAt: OptionalTimestampMsSchema,
        intermediateAssetId: IntermediateAssetIdSchema,
        priceImpactBps: v.number(),
        totalSlices: v.number(),
    }),
    v.transform((quote) => ({
        /** Subaccount the quote is for; `null` for the root account. */
        subaccountId: quote.terms.subaccountId === 0n ? null : formatId(quote.terms.subaccountId),
        sourceAssetId: quote.terms.sourceAssetId,
        destinationAssetId: quote.terms.destinationAssetId,
        /** Source amount quoted. */
        amount: e18ToDecimal(quote.terms.amount.value),
        execution: quote.terms.execution ?? marketExecution(),
        /**
         * Markets the swap trades on, in order: the direct market when one exists, otherwise two
         * through `intermediateAssetId`.
         */
        legs: quote.legs,
        /** A two-leg route's intermediate asset (USDT or USDC); `null` for a direct route. */
        intermediateAssetId: quote.intermediateAssetId,
        /** End-to-end price impact over every leg, in bps, rounded up. */
        priceImpactBps: quote.priceImpactBps,
        /** Slices the swap executes in: 1 at market. A TWAP is quoted as the whole amount now. */
        totalSlices: quote.totalSlices,
        /** Estimated destination amount after fees at current depth. */
        expectedAmountOut: e18ToDecimal(quote.expectedAmountOutE18),
        /** Destination amount after fees at the requested slippage; pass to `create`. */
        minAmountOut: e18ToDecimal(quote.minAmountOutE18),
        quotedAt: quote.quotedAt ?? null,
        /** 30 seconds after `quotedAt`; pass to `create` as `quoteExpiresAt`. */
        expiresAt: quote.expiresAt ?? null,
    })),
);

/** An estimate from current order-book depth. Reserves nothing; only `minAmountOut` binds. */
export type SwapQuote = v.InferOutput<typeof SwapQuoteSchema>;

export const SwapOrderSchema = v.pipe(
    v.object({
        orderId: v.bigint(),
        symbolId: v.number(),
        side: enumLabelSchema(SwapSideCodec.protoToOutput),
        leg: v.number(),
        status: enumLabelSchema(SwapOrderStatusCodec.protoToOutput),
        limitPriceTicks: v.bigint(),
        spentE18: AmountE18Schema,
        receivedE18: AmountE18Schema,
        feeE18: AmountE18Schema,
        slice: v.number(),
    }),
    v.transform((order) => ({
        /** Spot order ID once the market accepted it; `null` before. */
        orderId: order.orderId === 0n ? null : formatId(order.orderId),
        symbolId: order.symbolId,
        side: order.side,
        /** Zero-based position of the order's market in the route. */
        leg: order.leg,
        status: order.status,
        /** IOC limit price, quote per base: the worst price that nets the minimum rate. */
        limitPrice: scaledToDecimalOutput(order.limitPriceTicks, PRICE_SCALE),
        /** Spent in settled fills, fees in the spent asset included. */
        spent: e18ToDecimal(order.spentE18),
        /** Received in settled fills, after fees. */
        received: e18ToDecimal(order.receivedE18),
        /** Fee on settled fills, in the asset the order receives. */
        fee: e18ToDecimal(order.feeE18),
        /** Zero-based TWAP slice the order belongs to; 0 at market. */
        slice: order.slice,
    })),
);

export type SwapOrder = v.InferOutput<typeof SwapOrderSchema>;

export const SwapLegSchema = v.pipe(
    v.object({
        leg: v.number(),
        symbolId: v.number(),
        side: enumLabelSchema(SwapSideCodec.protoToOutput),
        spentE18: AmountE18Schema,
        receivedE18: AmountE18Schema,
        feeE18: AmountE18Schema,
        feeAssetId: v.number(),
    }),
    v.transform((leg) => ({
        /** Zero-based position of the market in the route. */
        leg: leg.leg,
        symbolId: leg.symbolId,
        side: leg.side,
        /** Spent in settled fills, fees in the spent asset included. */
        spent: e18ToDecimal(leg.spentE18),
        /** Received in settled fills, after fees. */
        received: e18ToDecimal(leg.receivedE18),
        /** Fee on settled fills, in `feeAssetId` (the asset the leg receives). */
        fee: e18ToDecimal(leg.feeE18),
        feeAssetId: leg.feeAssetId,
    })),
);

/** One market of a swap's route with its settled totals. Sum `fee` per `feeAssetId`. */
export type SwapLeg = v.InferOutput<typeof SwapLegSchema>;

/** Unspecified (`0`) → `null`. */
function sliceReason(reason: number) {
    return reason === 0 ? null : enumLabel(SwapSliceReasonCodec.protoToOutput, reason);
}

const SwapSliceSchema = v.pipe(
    v.object({
        index: v.number(),
        plannedAt: OptionalTimestampMsSchema,
        executedAt: OptionalTimestampMsSchema,
        finishedAt: OptionalTimestampMsSchema,
        state: enumLabelSchema(SwapSliceStateCodec.protoToOutput),
        reason: v.number(),
        completed: v.boolean(),
        inputTradedE18: AmountE18Schema,
        outputReceivedE18: AmountE18Schema,
        secondLegInputE18: AmountE18Schema,
        intermediateCarriedE18: AmountE18Schema,
        carryReason: v.number(),
    }),
    v.transform((slice) => ({
        /** Zero-based position in the frozen schedule. */
        index: slice.index,
        /** Frozen scheduled start of the slot. */
        plannedAt: slice.plannedAt ?? null,
        /** When its first order was sent; `null` while unsent. */
        executedAt: slice.executedAt ?? null,
        /** When its outcome became final; `null` while planned or executing. */
        finishedAt: slice.finishedAt ?? null,
        state: slice.state,
        /** Why a final slice did not trade in full; `null` while pending or after full trading. */
        reason: sliceReason(slice.reason),
        /** Whether the slice traded source amount and is over. */
        completed: slice.completed,
        /** Source the slice's first leg spent in settled fills. */
        inputTraded: e18ToDecimal(slice.inputTradedE18),
        /** Destination received after fees; on a two-leg route, may include carried intermediate. */
        outputReceived: e18ToDecimal(slice.outputReceivedE18),
        /** Intermediate the slice's second leg spent; `"0"` on a direct route. */
        secondLegInput: e18ToDecimal(slice.secondLegInputE18),
        /**
         * Intermediate acquired through this slice that no second leg had converted by its end:
         * carried to a later slice (`carryReason`), otherwise left on the account.
         */
        intermediateCarried: e18ToDecimal(slice.intermediateCarriedE18),
        /** Why intermediate could not be converted in this slice; `null` when none was refused. */
        carryReason: sliceReason(slice.carryReason),
    })),
);

/** One slot of a TWAP swap's schedule, including one that traded nothing. Times are epoch ms. */
export type SwapSlice = v.InferOutput<typeof SwapSliceSchema>;

const SwapProgressSchema = v.pipe(
    v.object({
        completedSlices: v.number(),
        totalSlices: v.number(),
        startedAt: OptionalTimestampMsSchema,
        deadline: OptionalTimestampMsSchema,
        slices: v.array(SwapSliceSchema),
        slicesTruncated: v.boolean(),
    }),
    v.transform((progress) => ({
        /** Slices that traded source amount and are over; counts every slice. */
        completedSlices: progress.completedSlices,
        /** 1 at market; a TWAP's slice count. */
        totalSlices: progress.totalSlices,
        /** A TWAP's first slot; `null` at market and until planned. */
        startedAt: progress.startedAt ?? null,
        /**
         * Last moment an order may be sent; `null` until planned. Orders sent before it may
         * settle after it, so poll until `isTerminal`, not until the deadline.
         */
        deadline: progress.deadline ?? null,
        /** A TWAP's first 50 slices in index order, future ones included; empty at market. */
        slices: progress.slices,
        /** True when the TWAP has more than 50 slices and only the first 50 are listed. */
        slicesTruncated: progress.slicesTruncated,
    })),
);

/** A swap's execution schedule and slices. Times are epoch ms. */
export type SwapProgress = v.InferOutput<typeof SwapProgressSchema>;

export const SwapSchema = v.pipe(
    v.object({
        swapId: PublicIdSchema,
        idempotencyKey: v.string(),
        subaccountId: SubaccountIdOutputSchema,
        sourceAssetId: v.number(),
        destinationAssetId: v.number(),
        amountE18: AmountE18Schema,
        minAmountOutE18: AmountE18Schema,
        status: enumLabelSchema(SwapStatusCodec.protoToOutput),
        reason: v.number(),
        isTerminal: v.boolean(),
        executedAmountE18: AmountE18Schema,
        unspentAmountE18: AmountE18Schema,
        receivedAmountE18: AmountE18Schema,
        orders: v.array(SwapOrderSchema),
        createdAt: OptionalTimestampMsSchema,
        execution: SwapExecutionSchema,
        intermediateAssetId: IntermediateAssetIdSchema,
        intermediateRemainderE18: AmountE18Schema,
        legs: v.array(SwapLegSchema),
        progress: v.optional(SwapProgressSchema),
    }),
    v.transform((swap) => ({
        swapId: swap.swapId,
        idempotencyKey: swap.idempotencyKey,
        /** Subaccount funding the swap; `null` for the root account. */
        subaccountId: swap.subaccountId,
        sourceAssetId: swap.sourceAssetId,
        destinationAssetId: swap.destinationAssetId,
        /** Source amount requested. */
        amount: e18ToDecimal(swap.amountE18),
        /** Minimum destination amount after fees for the whole amount. */
        minAmountOut: e18ToDecimal(swap.minAmountOutE18),
        status: swap.status,
        /** Why a `partially_completed` or `failed` swap did not trade everything; null otherwise. */
        reason: swap.reason === 0 ? null : enumLabel(SwapReasonCodec.protoToOutput, swap.reason),
        /** True once `status` is `completed`, `partially_completed` or `failed`; stop polling. */
        isTerminal: swap.isTerminal,
        /** Source spent in settled fills. */
        executedAmount: e18ToDecimal(swap.executedAmountE18),
        /** Source not spent; it never left the account. Final once `isTerminal`. */
        unspentAmount: e18ToDecimal(swap.unspentAmountE18),
        /** Destination received after fees. */
        receivedAmount: e18ToDecimal(swap.receivedAmountE18),
        /** Spot orders, in placement order. */
        orders: swap.orders,
        createdAt: swap.createdAt ?? null,
        execution: swap.execution ?? marketExecution(),
        /** A two-leg route's intermediate asset; `null` for a direct route. */
        intermediateAssetId: swap.intermediateAssetId,
        /**
         * Intermediate received and not converted; it is on the account. Final once
         * `isTerminal`; `"0"` for a direct route.
         */
        intermediateRemainder: e18ToDecimal(swap.intermediateRemainderE18),
        /** The route's markets in order with settled totals; sum `fee` per `feeAssetId`. */
        legs: swap.legs,
        /** Execution schedule and slices; `null` before execution is planned. */
        progress: swap.progress ?? null,
    })),
);

/** One swap and its outcome. Amounts are decimal strings and count settled fills only. */
export type Swap = v.InferOutput<typeof SwapSchema>;
