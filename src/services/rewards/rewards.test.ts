import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/rewards/v1/rewards_pb.js";
import { ValidationError } from "../../shared/errors.js";
import { unaryTransport } from "../../testing/service-harness.js";
import { RewardsService } from "./rewards.js";

const award = {
    awardId: "award-1",
    campaignId: "campaign-1",
    campaignName: "Launch",
    assetId: 2,
    amountBaseUnits: "18446744073709551616",
    fulfillmentMethod: Proto.RewardFulfillmentMethod.INTERNAL_TRADING,
    fulfillmentState: Proto.RewardFulfillmentState.READY_FOR_PAYOUT,
    publishedAt: { seconds: 1_700_000_000n, nanos: 0 },
};

describe("RewardsService", () => {
    it("lists awards through the authenticated transport", async () => {
        const authApi = unaryTransport({ awards: [award], nextPageToken: "next" });
        const service = new RewardsService({ authApi: authApi.transport });
        const signal = new AbortController().signal;

        await expect(
            service.listMyRewardAwards({ limit: 100, pageToken: " cursor " }, { signal }),
        ).resolves.toEqual({
            awards: [
                {
                    awardId: "award-1",
                    campaignId: "campaign-1",
                    campaignName: "Launch",
                    assetId: 2,
                    amountBaseUnits: "18446744073709551616",
                    fulfillmentMethod: "internal_trading",
                    fulfillmentState: "ready_for_payout",
                    publishedAt: 1_700_000_000_000,
                },
            ],
            nextPageToken: "next",
        });

        expect(authApi.lastCall()?.method.parent.typeName).toBe("rewards.v1.RewardCampaignService");
        expect(authApi.lastCall()?.message).toEqual({ limit: 100, pageToken: "cursor" });
        expect(authApi.lastCall()?.signal).toBe(signal);
    });

    it("defaults to the first server-sized page and maps unknown enums to unspecified", async () => {
        const authApi = unaryTransport({
            awards: [{ ...award, fulfillmentMethod: 99, fulfillmentState: 99 }],
            nextPageToken: "",
        });
        const service = new RewardsService({ authApi: authApi.transport });

        await expect(service.listMyRewardAwards()).resolves.toMatchObject({
            awards: [{ fulfillmentMethod: "unspecified", fulfillmentState: "unspecified" }],
            nextPageToken: "",
        });
        expect(authApi.lastCall()?.message).toEqual({ pageToken: "" });
    });

    it.each([
        { name: "limit over 100", input: { limit: 101 } },
        { name: "negative limit", input: { limit: -1 } },
        { name: "fractional limit", input: { limit: 1.5 } },
        { name: "page token over 256 characters", input: { pageToken: "x".repeat(257) } },
        { name: "unknown key", input: { pagetoken: "next" } },
    ])("rejects $name before calling the server", async ({ input }) => {
        const authApi = unaryTransport({ awards: [], nextPageToken: "" });
        const service = new RewardsService({ authApi: authApi.transport });

        await expect(service.listMyRewardAwards(input as never)).rejects.toBeInstanceOf(
            ValidationError,
        );
        expect(authApi.calls).toHaveLength(0);
    });
});
