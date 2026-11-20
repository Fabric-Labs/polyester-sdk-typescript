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
    positiveE18InputToScaled,
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
    SwapStatusCodec,
} from "./swap.codecs.js";

// Sent exactly as given: trimming would make " k " and "k" the same idempotency key.
const IdempotencyKeySchema = v.pipe(v.string(), v.minLength(1));

/** Positive decimal string → wire U128 in 18-decimal units. */
function e18AmountInputSchema(field: string) {
    return v.pipe(
        v.string(),
        v.transform((value) => toU128(positiveE18InputToScaled(field, value))),
    );
}

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
};

type SwapTermsInput = {
    account?: AccountScope;
    sourceAssetId: number;
    destinationAssetId: number;
    amount: U128Value;
};

function toTerms({ account, sourceAssetId, destinationAssetId, amount }: SwapTermsInput) {
    return removeUndefined({
        subaccountId: accountScopeToSubaccountId(account),
        sourceAssetId,
        destinationAssetId,
        amount: { case: "amountE18" as const, value: amount },
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
         * the same key with a different request is `IDEMPOTENCY_CONFLICT`.
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
});

export const SwapQuoteSchema = v.pipe(
    v.object({
        terms: SwapTermsOutputSchema,
        legs: v.array(SwapQuoteLegSchema),
        expectedAmountOutE18: AmountE18Schema,
        minAmountOutE18: AmountE18Schema,
        quotedAt: OptionalTimestampMsSchema,
        expiresAt: OptionalTimestampMsSchema,
    }),
    v.transform((quote) => ({
        /** Subaccount the quote is for; `null` for the root account. */
        subaccountId: quote.terms.subaccountId === 0n ? null : formatId(quote.terms.subaccountId),
        sourceAssetId: quote.terms.sourceAssetId,
        destinationAssetId: quote.terms.destinationAssetId,
        /** Source amount quoted. */
        amount: e18ToDecimal(quote.terms.amount.value),
        /** Markets the swap trades on, in order; a direct swap has one. */
        legs: quote.legs,
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
    })),
);

export type SwapOrder = v.InferOutput<typeof SwapOrderSchema>;

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
        feeE18: AmountE18Schema,
        orders: v.array(SwapOrderSchema),
        createdAt: OptionalTimestampMsSchema,
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
        /** Total fee, in the destination asset. */
        fee: e18ToDecimal(swap.feeE18),
        /** Spot orders, in placement order. */
        orders: swap.orders,
        createdAt: swap.createdAt ?? null,
    })),
);

/** One swap and its outcome. Amounts are decimal strings and count settled fills only. */
export type Swap = v.InferOutput<typeof SwapSchema>;
