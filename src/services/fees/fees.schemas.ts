import * as v from "valibot";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";

const DecimalStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

const SymbolIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const GetSpotFeeRatesInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        symbolIds: v.optional(v.pipe(v.array(SymbolIdSchema), v.maxLength(100)), []),
    }),
    v.transform(({ account, symbolIds }) => ({
        subaccountId: accountScopeToSubaccountId(account),
        symbolId: symbolIds ?? [],
    })),
);

export type GetSpotFeeRatesInput = v.InferInput<typeof GetSpotFeeRatesInputSchema>;
export type GetSpotFeeRatesRequest = v.InferOutput<typeof GetSpotFeeRatesInputSchema>;

export const SpotFeeRateSchema = v.object({
    symbolId: SymbolIdSchema,
    symbol: v.pipe(v.string(), v.trim(), v.minLength(1)),
    makerFeeRatePercent: DecimalStringSchema,
    takerFeeRatePercent: DecimalStringSchema,
    vipTier: v.pipe(v.number(), v.integer()),
});

export type SpotFeeRate = v.InferOutput<typeof SpotFeeRateSchema>;

export const SpotFeeRatesSchema = v.array(SpotFeeRateSchema);
