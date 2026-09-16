import * as v from "valibot";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import { BigIntStringSchema, TimestampMsSchema } from "../../shared/schemas.js";
import { VipTierNumberSchema } from "../vip/vip.schemas.js";
import { TradingRateLimitClassCodec } from "./rate-limits.codecs.js";

export type { TradingRateLimitClass } from "./rate-limits.codecs.js";

const TradingRateLimitClassOutputSchema = enumLabelSchema(TradingRateLimitClassCodec.protoToOutput);

export const TradingRateLimitRuleSchema = v.object({
    policyClass: TradingRateLimitClassOutputSchema,
    vipTier: VipTierNumberSchema,
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

export const TradingRateLimitsSchema = v.object({
    ...RateLimitConfigSchema.entries,
    apiKeyRules: v.optional(v.array(TradingRateLimitRuleSchema), []),
});

export type TradingRateLimits = v.InferOutput<typeof TradingRateLimitsSchema>;
