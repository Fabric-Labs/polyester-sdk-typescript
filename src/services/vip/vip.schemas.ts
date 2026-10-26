import * as v from "valibot";
import * as Proto from "../../gen/vip/v1/vip_pb.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import type { ProtoToOutput } from "../../utils/types.js";
import {
    BigIntStringSchema,
    OptionalTimestampMsSchema,
    TimestampMsSchema,
} from "../../shared/schemas.js";

const DecimalStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

const OptionalDecimalStringSchema = v.optional(DecimalStringSchema);

export const VipTierNumberSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

const VipTierRates = {
    volumeThresholdUsd: DecimalStringSchema,
    makerFeeRatePercent: DecimalStringSchema,
    takerFeeRatePercent: DecimalStringSchema,
};

export const VipTierSchema = v.union([
    v.object({
        tier: v.literal(0),
        ...VipTierRates,
    }),
    v.object({
        tier: v.pipe(VipTierNumberSchema, v.minValue(1)),
        aopThresholdUsd: DecimalStringSchema,
        ...VipTierRates,
    }),
]);

export type VipTier = v.InferOutput<typeof VipTierSchema>;

export const NextVipTierThresholdsSchema = v.object({
    tier: v.pipe(VipTierNumberSchema, v.minValue(1)),
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

export const VIP_METRIC_STATUS_VALUES = [
    "unspecified",
    "complete",
    "price_unavailable",
    "incomplete_history",
] as const;
export type VipMetricStatus = (typeof VIP_METRIC_STATUS_VALUES)[number];

const VipMetricStatusToOutput = {
    [Proto.VIPMetricStatus.METRIC_UNSPECIFIED]: "unspecified",
    [Proto.VIPMetricStatus.COMPLETE]: "complete",
    [Proto.VIPMetricStatus.PRICE_UNAVAILABLE]: "price_unavailable",
    [Proto.VIPMetricStatus.INCOMPLETE_HISTORY]: "incomplete_history",
} satisfies ProtoToOutput<Proto.VIPMetricStatus, VipMetricStatus>;

/**
 * How complete a rolling 30-day qualification metric is. With `price_unavailable`,
 * `settledVolume30dUsd` is a lower bound that leaves out executions without a USD price.
 */
export const VipMetricQualitySchema = v.object({
    status: enumLabelSchema(VipMetricStatusToOutput),
    /** Hourly buckets of the 720-hour window that are missing or incomplete. */
    incompleteHours: v.number(),
});

export type VipMetricQuality = v.InferOutput<typeof VipMetricQualitySchema>;

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
    settledVolumeQuality: v.optional(VipMetricQualitySchema),
    averageAopQuality: v.optional(VipMetricQualitySchema),
});

export type VipStatus = v.InferOutput<typeof VipStatusSchema>;
