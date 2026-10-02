import * as v from "valibot";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    BigIntStringSchema,
    OptionalTimestampMsSchema,
    positiveBigintStringInputSchema,
} from "../../shared/schemas.js";
import { RewardFulfillmentMethodCodec, RewardFulfillmentStateCodec } from "./rewards.codecs.js";

export const ListRewardAwardsInputSchema = v.strictObject({
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))),
    pageToken: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(256)), ""),
});

export type ListRewardAwardsInput = v.InferInput<typeof ListRewardAwardsInputSchema>;

export const SetRewardDestinationInputSchema = v.strictObject({
    awardId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128)),
    destinationAddress: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(512)),
    expectedRevision: positiveBigintStringInputSchema("expectedRevision"),
    requestId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128)),
});

export type SetRewardDestinationInput = v.InferInput<typeof SetRewardDestinationInputSchema>;

export const RewardAwardSchema = v.object({
    awardId: v.string(),
    campaignId: v.string(),
    campaignName: v.string(),
    assetId: v.number(),
    amountBaseUnits: v.string(),
    fulfillmentMethod: enumLabelSchema(RewardFulfillmentMethodCodec.protoToOutput),
    fulfillmentState: enumLabelSchema(RewardFulfillmentStateCodec.protoToOutput),
    publishedAt: OptionalTimestampMsSchema,
    network: v.string(),
    fulfillmentRevision: BigIntStringSchema,
    destinationAddress: v.string(),
    transactionId: v.string(),
});

export type RewardAward = v.InferOutput<typeof RewardAwardSchema>;

export const ListRewardAwardsResultSchema = v.object({
    awards: v.optional(v.array(RewardAwardSchema), []),
    nextPageToken: v.string(),
});

export type ListRewardAwardsResult = v.InferOutput<typeof ListRewardAwardsResultSchema>;

export const SetRewardDestinationResultSchema = v.object({
    award: RewardAwardSchema,
});

export type SetRewardDestinationResult = v.InferOutput<typeof SetRewardDestinationResultSchema>;
