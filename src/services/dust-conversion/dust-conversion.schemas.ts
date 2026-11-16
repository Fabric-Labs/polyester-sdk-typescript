import type { MessageInitShape } from "@bufbuild/protobuf";
import * as v from "valibot";
import type * as Proto from "../../gen/transfer/v1/dust_conversion_pb.js";
import { ErrorCode } from "../../gen/transfer/v1/internal_transfer_pb.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { E18_SCALE, scaledToDecimalOutput } from "../../shared/decimal-surface.js";
import { codeName } from "../../shared/error-detail.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import { OptionalTimestampMsSchema, U128Schema } from "../../shared/schemas.js";
import { fromU128, type U128Value } from "../../utils/u128.js";
import { PositiveUint32InputSchema } from "../shared.js";
import { DustAssetEligibilityCodec, DustConversionStateCodec } from "./dust-conversion.codecs.js";

const RequiredInputStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

export const ListDustBalancesInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        /** One of the response's `targets`; omit for the first. */
        targetAssetId: v.optional(PositiveUint32InputSchema),
    }),
    v.transform(
        ({ account, targetAssetId }) =>
            ({
                subaccountId: accountScopeToSubaccountId(account),
                targetAssetId,
            }) satisfies MessageInitShape<typeof Proto.ListDustBalancesRequestSchema>,
    ),
);

export type ListDustBalancesInput = v.InferInput<typeof ListDustBalancesInputSchema>;

export const QuoteDustConversionInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        /** One of `listBalances`' `targets`. */
        targetAssetId: PositiveUint32InputSchema,
    }),
    v.transform(
        ({ account, targetAssetId }) =>
            ({
                subaccountId: accountScopeToSubaccountId(account),
                targetAssetId,
            }) satisfies MessageInitShape<typeof Proto.QuoteDustConversionRequestSchema>,
    ),
);

export type QuoteDustConversionInput = v.InferInput<typeof QuoteDustConversionInputSchema>;

export const CreateDustConversionInputSchema = v.pipe(
    v.strictObject({
        /** Must select the quote's account. */
        ...AccountScopeInputEntries,
        /** `quoteId` from `quote`, at most 30 seconds old. A quote converts once. */
        quoteId: RequiredInputStringSchema,
        /** Stable key collapsing retries for the account; reusing it returns the same conversion. */
        idempotencyKey: RequiredInputStringSchema,
    }),
    v.transform(
        ({ account, quoteId, idempotencyKey }) =>
            ({
                subaccountId: accountScopeToSubaccountId(account),
                quoteId,
                idempotencyKey,
            }) satisfies MessageInitShape<typeof Proto.CreateDustConversionRequestSchema>,
    ),
);

export type CreateDustConversionInput = v.InferInput<typeof CreateDustConversionInputSchema>;

export const GetDustConversionInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        conversionId: RequiredInputStringSchema,
    }),
    v.transform(
        ({ account, conversionId }) =>
            ({
                subaccountId: accountScopeToSubaccountId(account),
                conversionId,
            }) satisfies MessageInitShape<typeof Proto.GetDustConversionRequestSchema>,
    ),
);

export type GetDustConversionInput = v.InferInput<typeof GetDustConversionInputSchema>;

export const ListDustConversionsInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        /** Page size: default 20, at most 100. */
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
        /** Previous `nextPageToken`; reuse only with the same account. */
        pageToken: v.optional(v.pipe(v.string(), v.trim())),
    }),
    v.transform(
        ({ account, limit, pageToken }) =>
            ({
                subaccountId: accountScopeToSubaccountId(account),
                limit,
                pageToken,
            }) satisfies MessageInitShape<typeof Proto.ListDustConversionsRequestSchema>,
    ),
);

export type ListDustConversionsInput = v.InferInput<typeof ListDustConversionsInputSchema>;

/** Wire `*_e18` U128 → exact decimal string; an unset amount is `"0"`. */
function e18ToDecimal(value: U128Value | undefined): string {
    return scaledToDecimalOutput(fromU128(value), E18_SCALE);
}

const AmountE18Schema = v.optional(U128Schema);

/** Decimal scale a wire price may carry, as catalog scales are bounded. */
const PriceScaleSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(18));

/** One Trading balance judged for conversion. Amounts are decimal strings. */
export const DustBalanceSchema = v.pipe(
    v.object({
        assetId: v.number(),
        amountE18: AmountE18Schema,
        eligibility: enumLabelSchema(DustAssetEligibilityCodec.protoToOutput),
        usdValueE18: AmountE18Schema,
    }),
    v.transform((balance) => ({
        assetId: balance.assetId,
        /** The whole available balance: what no open order or other reservation holds. */
        amount: e18ToDecimal(balance.amountE18),
        eligibility: balance.eligibility,
        /** USD value, rounded down; null when the asset has no current price. */
        usdValue: balance.usdValueE18 === undefined ? null : e18ToDecimal(balance.usdValueE18),
    })),
);

export type DustBalance = v.InferOutput<typeof DustBalanceSchema>;

/** USD index price a quote used for one asset. */
export const DustAssetPriceSchema = v.pipe(
    v.object({
        assetId: v.number(),
        priceTicks: v.bigint(),
        priceScale: PriceScaleSchema,
        asOf: OptionalTimestampMsSchema,
    }),
    v.transform((price) => ({
        assetId: price.assetId,
        /** USD per whole asset unit, exact. */
        price: scaledToDecimalOutput(price.priceTicks, price.priceScale),
        /** Time of the oldest index observation the price used. */
        asOf: price.asOf ?? null,
    })),
);

export type DustAssetPrice = v.InferOutput<typeof DustAssetPriceSchema>;

export const DustConversionSchema = v.pipe(
    v.object({
        conversionId: v.pipe(v.string(), v.minLength(1)),
        quoteId: v.pipe(v.string(), v.minLength(1)),
        state: enumLabelSchema(DustConversionStateCodec.protoToOutput),
        refusalCode: v.number(),
        targetAssetId: v.number(),
        sources: v.array(v.object({ assetId: v.number(), amountE18: AmountE18Schema })),
        payoutE18: AmountE18Schema,
        quotedPayoutE18: AmountE18Schema,
        feeE18: AmountE18Schema,
        feeBps: v.number(),
        createdAt: OptionalTimestampMsSchema,
        completedAt: OptionalTimestampMsSchema,
    }),
    v.transform((conversion) => ({
        conversionId: conversion.conversionId,
        /** The quote the conversion converted. */
        quoteId: conversion.quoteId,
        state: conversion.state,
        /** Why a `refused` conversion was refused; null otherwise. */
        refusalCode:
            conversion.refusalCode === ErrorCode.UNSPECIFIED
                ? null
                : (codeName(ErrorCode, conversion.refusalCode) ?? "UNSPECIFIED"),
        targetAssetId: conversion.targetAssetId,
        /** Whole quoted balances moved, in asset id order. */
        sources: conversion.sources.map((source) => ({
            assetId: source.assetId,
            amount: e18ToDecimal(source.amountE18),
        })),
        /** Target amount credited after the fee, at the index prices when it was created. */
        payout: e18ToDecimal(conversion.payoutE18),
        /** The payout the quote showed. */
        quotedPayout: e18ToDecimal(conversion.quotedPayoutE18),
        /** Fee taken from the payout, in the target asset. */
        fee: e18ToDecimal(conversion.feeE18),
        feeBps: conversion.feeBps,
        createdAt: conversion.createdAt ?? null,
        /** Null until `completed`. */
        completedAt: conversion.completedAt ?? null,
    })),
);

/** One conversion of the account's dust into a target asset. Amounts are decimal strings. */
export type DustConversion = v.InferOutput<typeof DustConversionSchema>;

export const ListDustBalancesResultSchema = v.pipe(
    v.object({
        targetAssetId: v.number(),
        targets: v.array(v.number()),
        feeBps: v.number(),
        balances: v.array(DustBalanceSchema),
        grossUsdE18: AmountE18Schema,
        payoutE18: AmountE18Schema,
        targetAvailable: v.boolean(),
    }),
    v.transform((result) => ({
        /** Target the balances were judged for. */
        targetAssetId: result.targetAssetId,
        /** Every asset the account can convert dust into, in preference order. */
        targets: result.targets,
        /** Fee taken from the payout. */
        feeBps: result.feeBps,
        /** Every nonzero available Trading balance, in asset id order. */
        balances: result.balances,
        /** Eligible balances' total USD value, rounded down. */
        grossUsd: e18ToDecimal(result.grossUsdE18),
        /** Target amount they would bring now, after the fee. */
        payout: e18ToDecimal(result.payoutE18),
        /** False when the target cannot be paid now; `quote` is then refused. */
        targetAvailable: result.targetAvailable,
    })),
);

/** The account's balances judged for one target. Reserves nothing. */
export type ListDustBalancesResult = v.InferOutput<typeof ListDustBalancesResultSchema>;

export const DustConversionQuoteSchema = v.pipe(
    v.object({
        quoteId: v.string(),
        expiresAt: OptionalTimestampMsSchema,
        targetAssetId: v.number(),
        feeBps: v.number(),
        grossUsdE18: AmountE18Schema,
        payoutE18: AmountE18Schema,
        balances: v.array(DustBalanceSchema),
        prices: v.array(DustAssetPriceSchema),
    }),
    v.transform((quote) => ({
        /** Pass to `create`. Empty when nothing converts; `balances` says why. */
        quoteId: quote.quoteId,
        /** After this, `create` refuses the quote with `DUST_QUOTE_EXPIRED`. */
        expiresAt: quote.expiresAt ?? null,
        targetAssetId: quote.targetAssetId,
        /** Fee taken from the payout. */
        feeBps: quote.feeBps,
        /** Sources' total USD value, rounded down. */
        grossUsd: e18ToDecimal(quote.grossUsdE18),
        /** Target amount after the fee, rounded down to the target's quantity precision. */
        payout: e18ToDecimal(quote.payoutE18),
        /** Every nonzero available Trading balance, sources and others, in asset id order. */
        balances: quote.balances,
        /** Prices of the sources and the target, in asset id order. */
        prices: quote.prices,
    })),
);

/** A quote valid for 30 seconds. Reserves nothing. */
export type DustConversionQuote = v.InferOutput<typeof DustConversionQuoteSchema>;

export const ListDustConversionsResultSchema = v.object({
    conversions: v.array(DustConversionSchema),
    nextPageToken: v.optional(v.string(), ""),
});

/** One page of conversions, newest first; an empty `nextPageToken` means no more. */
export type ListDustConversionsResult = v.InferOutput<typeof ListDustConversionsResultSchema>;
