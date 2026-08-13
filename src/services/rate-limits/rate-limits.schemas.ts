import * as v from "valibot";
import * as Proto from "../../gen/ratelimit/v1/ratelimit_pb.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { BigIntStringSchema, TimestampMsSchema } from "../../shared/schemas.js";
import type { DecodedEnum } from "../../utils/types.js";
import {
    TRADING_RATE_LIMIT_CLASS_VALUES,
    TradingRateLimitClassCodec,
    type TradingRateLimitClassName,
} from "./rate-limits.codecs.js";

export { TRADING_RATE_LIMIT_CLASS_VALUES } from "./rate-limits.codecs.js";

export const TradingRateLimitClassSchema = v.picklist(TRADING_RATE_LIMIT_CLASS_VALUES);

export type TradingRateLimitClass = v.InferOutput<typeof TradingRateLimitClassSchema>;

const TradingRateLimitClassOutputSchema = v.pipe(
    v.enum(Proto.TradingRateLimitClass),
    v.transform(
        (value): DecodedEnum<TradingRateLimitClassName> =>
            requiredEnumLabel(
                TradingRateLimitClassCodec.protoToOutput,
                value,
                "TradingRateLimitRuleSchema",
                "policyClass",
            ),
    ),
);

export const TradingRateLimitRuleSchema = v.object({
    policyClass: TradingRateLimitClassOutputSchema,
    tier: v.pipe(v.number(), v.integer()),
    quotaWeight: BigIntStringSchema,
    periodMs: BigIntStringSchema,
    burstWeight: BigIntStringSchema,
});

export type TradingRateLimitRule = v.InferOutput<typeof TradingRateLimitRuleSchema>;

export const RateLimitConfigSchema = v.object({
    policyVersion: BigIntStringSchema,
    effectiveFrom: TimestampMsSchema,
    rules: v.array(TradingRateLimitRuleSchema),
});

export type RateLimitConfig = v.InferOutput<typeof RateLimitConfigSchema>;

export const GetTradingRateLimitsInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
    }),
    v.transform(({ account }) => ({
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type GetTradingRateLimitsInput = v.InferInput<typeof GetTradingRateLimitsInputSchema>;
export type GetTradingRateLimitsRequest = v.InferOutput<typeof GetTradingRateLimitsInputSchema>;

export const TradingRateLimitsSchema = v.object({
    policyVersion: BigIntStringSchema,
    effectiveFrom: TimestampMsSchema,
    rules: v.array(TradingRateLimitRuleSchema),
    apiKeyRules: v.optional(v.array(TradingRateLimitRuleSchema), []),
});

export type TradingRateLimits = v.InferOutput<typeof TradingRateLimitsSchema>;
