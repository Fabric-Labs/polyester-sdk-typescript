import * as v from "valibot";
import * as Proto from "../../gen/claims/v1/claims_pb.js";
import { E18_SCALE, scaledToDecimalOutput } from "../../shared/decimal-surface.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { OptionalTimestampMsSchema, U128Schema } from "../../shared/schemas.js";
import { fromU128 } from "../../utils/u128.js";
import { ClaimPolicyCodec, DailyClaimStateCodec } from "./claims.codecs.js";

const DailyClaimStateSchema = v.pipe(
    v.enum(Proto.DailyClaimState),
    v.transform((state) =>
        requiredEnumLabel(
            DailyClaimStateCodec.protoToOutput,
            state,
            "DailyClaimStateSchema",
            "state",
        ),
    ),
);

const ClaimPolicySchema = v.pipe(
    v.enum(Proto.ClaimPolicy),
    v.transform((claimPolicy) =>
        requiredEnumLabel(
            ClaimPolicyCodec.protoToOutput,
            claimPolicy,
            "ClaimPolicySchema",
            "claimPolicy",
        ),
    ),
);

export const ClaimCampaignSchema = v.object({
    campaignId: v.string(),
    name: v.string(),
    description: v.string(),
    claimPolicy: ClaimPolicySchema,
});

export type ClaimCampaign = v.InferOutput<typeof ClaimCampaignSchema>;

export const DailyClaimRewardSchema = v.pipe(
    v.object({
        assetId: v.number(),
        assetCode: v.string(),
        amountE18: v.optional(U128Schema),
    }),
    v.transform(({ amountE18, ...reward }) => ({
        ...reward,
        amount: scaledToDecimalOutput(fromU128(amountE18), E18_SCALE),
    })),
);

export type DailyClaimReward = v.InferOutput<typeof DailyClaimRewardSchema>;

export const DailyClaimTransferSchema = v.object({
    assetId: v.number(),
    transferId: v.string(),
});

export type DailyClaimTransfer = v.InferOutput<typeof DailyClaimTransferSchema>;

export const DailyClaimStatusSchema = v.object({
    state: DailyClaimStateSchema,
    resetAt: OptionalTimestampMsSchema,
    rewards: v.optional(v.array(DailyClaimRewardSchema), []),
    claimId: v.string(),
    campaign: v.optional(ClaimCampaignSchema),
});

export type DailyClaimStatus = v.InferOutput<typeof DailyClaimStatusSchema>;

export const ClaimDailyRewardResultSchema = v.object({
    claimId: v.string(),
    state: DailyClaimStateSchema,
    claimedAt: OptionalTimestampMsSchema,
    rewards: v.optional(v.array(DailyClaimRewardSchema), []),
    transfers: v.optional(v.array(DailyClaimTransferSchema), []),
    resetAt: OptionalTimestampMsSchema,
    campaign: v.optional(ClaimCampaignSchema),
});

export type ClaimDailyRewardResult = v.InferOutput<typeof ClaimDailyRewardResultSchema>;
