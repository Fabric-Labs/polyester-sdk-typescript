import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/claims/v1/claims_pb.js";
import { ClaimDailyRewardResultSchema, DailyClaimStatusSchema } from "./claims.schemas.js";

const resetAt = { seconds: 1_700_000_000n, nanos: 0 };

describe("DailyClaimStatusSchema", () => {
    it("decodes a delayed payout and its reason, leaving unset or unknown reasons undefined", () => {
        const status = (payoutDelayReason?: number) =>
            v.parse(DailyClaimStatusSchema, {
                state: Proto.DailyClaimState.CLAIM_PAYOUT_DELAYED,
                claimId: "claim-1",
                payoutDelayReason,
            });

        expect(status(Proto.ErrorCode.CLAIM_PAYOUT_UNAVAILABLE)).toMatchObject({
            state: "payout_delayed",
            payoutDelayReason: "CLAIM_PAYOUT_UNAVAILABLE",
        });
        expect(status(Proto.ErrorCode.CLAIM_TEMPORARILY_UNAVAILABLE).payoutDelayReason).toBe(
            "CLAIM_TEMPORARILY_UNAVAILABLE",
        );
        expect(status(Proto.ErrorCode.UNSPECIFIED).payoutDelayReason).toBeUndefined();
        expect(status().payoutDelayReason).toBeUndefined();
        expect(status(999).payoutDelayReason).toBeUndefined();
    });

    it("decodes status, campaign, timestamps, and fixed-E18 rewards", () => {
        expect(
            v.parse(DailyClaimStatusSchema, {
                state: Proto.DailyClaimState.CLAIM_AVAILABLE,
                resetAt,
                rewards: [
                    {
                        assetId: 1,
                        assetCode: "USDC",
                        amountE18: { hi: 0n, lo: 1_250_000_000_000_000_000n },
                    },
                ],
                claimId: "",
                campaign: {
                    campaignId: "daily-usdc",
                    name: "Daily USDC",
                    description: "A daily reward",
                    claimPolicy: Proto.ClaimPolicy.UTC_DAILY,
                },
            }),
        ).toEqual({
            state: "available",
            resetAt: 1_700_000_000_000,
            rewards: [{ assetId: 1, assetCode: "USDC", amount: "1.25" }],
            claimId: "",
            campaign: {
                campaignId: "daily-usdc",
                name: "Daily USDC",
                description: "A daily reward",
                claimPolicy: "utc_daily",
            },
        });
    });

    it("preserves an E18 amount whose high word exceeds Number precision", () => {
        expect(
            v.parse(DailyClaimStatusSchema, {
                state: Proto.DailyClaimState.CLAIM_AVAILABLE,
                rewards: [
                    {
                        assetId: 1,
                        assetCode: "USDC",
                        amountE18: { hi: 1n, lo: 0n },
                    },
                ],
                claimId: "",
            }),
        ).toMatchObject({
            rewards: [{ assetId: 1, assetCode: "USDC", amount: "18.446744073709551616" }],
        });
    });
});

describe("ClaimDailyRewardResultSchema", () => {
    it("keeps processing claims without completion fields", () => {
        expect(
            v.parse(ClaimDailyRewardResultSchema, {
                claimId: "claim-1",
                state: Proto.DailyClaimState.CLAIM_PROCESSING,
                rewards: [],
                transfers: [],
            }),
        ).toEqual({
            claimId: "claim-1",
            state: "processing",
            claimedAt: undefined,
            rewards: [],
            transfers: [],
            resetAt: undefined,
            campaign: undefined,
        });
    });
});
