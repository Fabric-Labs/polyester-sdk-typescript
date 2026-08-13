import * as v from "valibot";
import * as Proto from "../../gen/ratelimit/v1/ratelimit_pb.js";
import { AccountScopeInputEntries } from "../../shared/account-scope.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { BigIntStringSchema, TimestampMsSchema } from "../../shared/schemas.js";
import { TradingRateLimitClassCodec, type TradingRateLimitClass } from "./rate-limits.codecs.js";

export type { TradingRateLimitClass } from "./rate-limits.codecs.js";

const TradingRateLimitClassOutputSchema = v.pipe(
    v.enum(Proto.TradingRateLimitClass),
    v.transform(
        (value): TradingRateLimitClass =>
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

export const GetTradingRateLimitsInputSchema = v.strictObject({
    ...AccountScopeInputEntries,
});

export const TradingRateLimitsSchema = v.object({
    ...RateLimitConfigSchema.entries,
    apiKeyRules: v.optional(v.array(TradingRateLimitRuleSchema), []),
});

export type TradingRateLimits = v.InferOutput<typeof TradingRateLimitsSchema>;
