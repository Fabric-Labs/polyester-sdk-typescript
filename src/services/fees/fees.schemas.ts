import * as v from "valibot";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { OptionalTimestampMsSchema, TimestampMsSchema } from "../../shared/schemas.js";
import { SymbolIdInputSchema } from "../shared.js";
import { VipTierNumberSchema } from "../vip/vip.schemas.js";

const DecimalStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

export const GetSpotFeeRatesInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        symbolIds: v.optional(
            v.pipe(
                v.array(SymbolIdInputSchema),
                v.transform((ids) => [...new Set(ids)]),
                v.maxLength(100),
            ),
            [],
        ),
    }),
    v.transform(({ account, symbolIds }) => ({
        subaccountId: accountScopeToSubaccountId(account),
        symbolId: symbolIds,
    })),
);

export type GetSpotFeeRatesInput = v.InferInput<typeof GetSpotFeeRatesInputSchema>;
export type GetSpotFeeRatesRequest = v.InferOutput<typeof GetSpotFeeRatesInputSchema>;

const SpotFeeDiscountSchema = v.object({
    makerDiscountPercent: DecimalStringSchema,
    takerDiscountPercent: DecimalStringSchema,
    /** False when the discount applies to selected markets, this one included. */
    allMarkets: v.boolean(),
    effectiveFrom: TimestampMsSchema,
    /** Unix ms, exclusive; undefined when the discount has no scheduled end. */
    effectiveTo: OptionalTimestampMsSchema,
});

export type SpotFeeDiscount = v.InferOutput<typeof SpotFeeDiscountSchema>;

/**
 * Components of one market's effective rates. Applying the tier rate, then
 * `marketMultiplier`, then the highest of `accountDiscounts`, then
 * `referralDiscount`, in integer arithmetic, reproduces the effective rates.
 */
const SpotFeeRateBreakdownSchema = v.object({
    tierMakerFeeRatePercent: DecimalStringSchema,
    tierTakerFeeRatePercent: DecimalStringSchema,
    marketMultiplier: v.optional(
        v.object({
            makerMultiplierPercent: DecimalStringSchema,
            takerMultiplierPercent: DecimalStringSchema,
            effectiveFrom: TimestampMsSchema,
            effectiveTo: OptionalTimestampMsSchema,
        }),
    ),
    accountDiscounts: v.array(SpotFeeDiscountSchema),
    referralDiscount: v.optional(SpotFeeDiscountSchema),
});

export type SpotFeeRateBreakdown = v.InferOutput<typeof SpotFeeRateBreakdownSchema>;

export const SpotFeeRateSchema = v.object({
    symbolId: v.number(),
    makerFeeRatePercent: DecimalStringSchema,
    takerFeeRatePercent: DecimalStringSchema,
    vipTier: VipTierNumberSchema,
    /**
     * Rate a new order reserves its quote-asset fee at; size buy orders by it.
     * At least the effective rates, and discounts never lower it.
     */
    reserveFeeRatePercent: DecimalStringSchema,
    /** Rate a new post-only limit order reserves its quote-asset fee at. */
    postOnlyReserveFeeRatePercent: DecimalStringSchema,
    breakdown: SpotFeeRateBreakdownSchema,
    /** Unix ms of the earliest scheduled change to a rate component; undefined when none. */
    nextChangeAt: OptionalTimestampMsSchema,
});

export type SpotFeeRate = v.InferOutput<typeof SpotFeeRateSchema>;

export const SpotFeeRatesSchema = v.array(SpotFeeRateSchema);
