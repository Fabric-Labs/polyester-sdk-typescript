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

export const AcknowledgeRewardAwardInputSchema = v.pipe(
    v.strictObject({
        awardId: v.pipe(v.string(), v.trim(), v.uuid()),
        revealed: v.optional(v.boolean(), false),
        deliverySeen: v.optional(v.boolean(), false),
    }),
    v.check(
        ({ revealed, deliverySeen }) => revealed || deliverySeen,
        "Set revealed or deliverySeen to true.",
    ),
);

export type AcknowledgeRewardAwardInput = v.InferInput<typeof AcknowledgeRewardAwardInputSchema>;

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
    /** When the recipient first acknowledged revealing the award, in any session; absent until then. */
    revealedAt: OptionalTimestampMsSchema,
    /** When the recipient first acknowledged seeing the paid award's delivery; absent until then. */
    deliverySeenAt: OptionalTimestampMsSchema,
});

export type RewardAward = v.InferOutput<typeof RewardAwardSchema>;

export const ListRewardAwardsResultSchema = v.object({
    awards: v.optional(v.array(RewardAwardSchema), []),
    nextPageToken: v.string(),
    /**
     * True while a campaign can still publish awards or one of this account's awards is awaiting
     * a destination, ready for payout, or failed and retryable. When false, polling cannot return
     * new awards or award changes until a new campaign is created, so check again on the next
     * page load or focus instead.
     */
    awardsMayChange: v.boolean(),
});

export type ListRewardAwardsResult = v.InferOutput<typeof ListRewardAwardsResultSchema>;

export const SetRewardDestinationResultSchema = v.object({
    award: RewardAwardSchema,
});

export type SetRewardDestinationResult = v.InferOutput<typeof SetRewardDestinationResultSchema>;

export const AcknowledgeRewardAwardResultSchema = v.object({
    award: RewardAwardSchema,
});

export type AcknowledgeRewardAwardResult = v.InferOutput<typeof AcknowledgeRewardAwardResultSchema>;
