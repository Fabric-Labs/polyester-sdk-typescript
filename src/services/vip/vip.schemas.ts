import * as v from "valibot";
import {
    BigIntStringSchema,
    OptionalTimestampMsSchema,
    TimestampMsSchema,
} from "../../shared/schemas.js";

const DecimalStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

const OptionalDecimalStringSchema = v.optional(DecimalStringSchema);

const VipTierNumberSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10));

export const VipTierSchema = v.object({
    tier: VipTierNumberSchema,
    volumeThresholdUsd: DecimalStringSchema,
    aopThresholdUsd: OptionalDecimalStringSchema,
    makerFeeRatePercent: DecimalStringSchema,
    takerFeeRatePercent: DecimalStringSchema,
});

export type VipTier = v.InferOutput<typeof VipTierSchema>;

export const NextVipTierThresholdsSchema = v.object({
    tier: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10)),
    volumeThresholdUsd: DecimalStringSchema,
    aopThresholdUsd: DecimalStringSchema,
});

export type NextVipTierThresholds = v.InferOutput<typeof NextVipTierThresholdsSchema>;

export const VipTierCatalogSchema = v.object({
    policyVersion: BigIntStringSchema,
    effectiveFrom: TimestampMsSchema,
    retentionThresholdBp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)),
    tiers: v.array(VipTierSchema),
});

export type VipTierCatalog = v.InferOutput<typeof VipTierCatalogSchema>;

export const VipStatusSchema = v.object({
    tier: VipTierNumberSchema,
    volumeTier: VipTierNumberSchema,
    aopTier: VipTierNumberSchema,
    settledVolume30dUsd: OptionalDecimalStringSchema,
    averageAop30dUsd: OptionalDecimalStringSchema,
    policyVersion: BigIntStringSchema,
    policyEffectiveFrom: TimestampMsSchema,
    effectiveFrom: OptionalTimestampMsSchema,
    evaluatedAt: OptionalTimestampMsSchema,
    metricsAsOf: OptionalTimestampMsSchema,
    nextTierThresholds: v.optional(NextVipTierThresholdsSchema),
});

export type VipStatus = v.InferOutput<typeof VipStatusSchema>;
