import * as Proto from "../../gen/claims/v1/claims_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const DAILY_CLAIM_STATE_VALUES = [
    "unspecified",
    "available",
    "processing",
    "claimed",
    "unavailable",
] as const;
export type DailyClaimState = (typeof DAILY_CLAIM_STATE_VALUES)[number];

export const CLAIM_POLICY_VALUES = ["unspecified", "utc_daily"] as const;
export type ClaimPolicy = (typeof CLAIM_POLICY_VALUES)[number];

export const DailyClaimStateCodec = {
    protoToOutput: {
        [Proto.DailyClaimState.CLAIM_UNSPECIFIED]: "unspecified",
        [Proto.DailyClaimState.CLAIM_AVAILABLE]: "available",
        [Proto.DailyClaimState.CLAIM_PROCESSING]: "processing",
        [Proto.DailyClaimState.CLAIM_CLAIMED]: "claimed",
        [Proto.DailyClaimState.CLAIM_UNAVAILABLE]: "unavailable",
    } satisfies ProtoToOutput<Proto.DailyClaimState, DailyClaimState>,
} as const;

export const ClaimPolicyCodec = {
    protoToOutput: {
        [Proto.ClaimPolicy.POLICY_UNSPECIFIED]: "unspecified",
        [Proto.ClaimPolicy.UTC_DAILY]: "utc_daily",
    } satisfies ProtoToOutput<Proto.ClaimPolicy, ClaimPolicy>,
} as const;
