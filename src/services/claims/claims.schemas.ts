import * as v from "valibot";
import * as Proto from "../../gen/claims/v1/claims_pb.js";
import { E18_SCALE, scaledToDecimalOutput } from "../../shared/decimal-surface.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    OptionalPublicIdSchema,
    OptionalTimestampMsSchema,
    optionalSubaccountIdInputSchema,
    U128Schema,
} from "../../shared/schemas.js";
import { fromU128 } from "../../utils/u128.js";
import { ClaimPolicyCodec, DailyClaimStateCodec } from "./claims.codecs.js";

const DailyClaimStateSchema = enumLabelSchema(DailyClaimStateCodec.protoToOutput);

const ClaimPolicySchema = enumLabelSchema(ClaimPolicyCodec.protoToOutput);

/** A claims error code name, as on `PolyesterError.detail.code` for the claims service. */
export type ClaimPayoutDelayReason = Exclude<keyof typeof Proto.ErrorCode, "UNSPECIFIED">;

// Unset, and values this build does not know, decode as `undefined`; the
// `payout_delayed` state alone still says the payout is delayed.
const PayoutDelayReasonSchema = v.pipe(
    v.optional(v.number(), Proto.ErrorCode.UNSPECIFIED),
    v.transform((value) =>
        value === Proto.ErrorCode.UNSPECIFIED
            ? undefined
            : (Proto.ErrorCode[value] as ClaimPayoutDelayReason | undefined),
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
    subaccountId: OptionalPublicIdSchema,
    payoutDelayReason: PayoutDelayReasonSchema,
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
    subaccountId: OptionalPublicIdSchema,
});

export type ClaimDailyRewardResult = v.InferOutput<typeof ClaimDailyRewardResultSchema>;

// The wire treats `0n` as "pay the root account", so an id that decodes to zero
// must fail here instead of silently redirecting the reward.
export const ClaimDailyRewardInputSchema = v.strictObject({
    subaccountId: v.pipe(
        optionalSubaccountIdInputSchema(),
        v.check((value) => value !== 0n, "subaccountId: must be greater than zero"),
    ),
});

export type ClaimDailyRewardInput = v.InferInput<typeof ClaimDailyRewardInputSchema>;
