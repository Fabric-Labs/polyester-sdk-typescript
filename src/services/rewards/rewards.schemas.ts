import * as v from "valibot";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import { OptionalTimestampMsSchema } from "../../shared/schemas.js";
import { RewardFulfillmentMethodCodec, RewardFulfillmentStateCodec } from "./rewards.codecs.js";

export const ListMyRewardAwardsInputSchema = v.strictObject({
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))),
    pageToken: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(256)), ""),
});

export type ListMyRewardAwardsInput = v.InferInput<typeof ListMyRewardAwardsInputSchema>;

export const RewardAwardSchema = v.object({
    awardId: v.string(),
    campaignId: v.string(),
    campaignName: v.string(),
    assetId: v.number(),
    amountBaseUnits: v.string(),
    fulfillmentMethod: enumLabelSchema(RewardFulfillmentMethodCodec.protoToOutput),
    fulfillmentState: enumLabelSchema(RewardFulfillmentStateCodec.protoToOutput),
    publishedAt: OptionalTimestampMsSchema,
});

export type RewardAward = v.InferOutput<typeof RewardAwardSchema>;

export const ListMyRewardAwardsResultSchema = v.object({
    awards: v.optional(v.array(RewardAwardSchema), []),
    nextPageToken: v.string(),
});

export type ListMyRewardAwardsResult = v.InferOutput<typeof ListMyRewardAwardsResultSchema>;
