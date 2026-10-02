import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/rewards/v1/rewards_pb.js";
import { ValidationError } from "../../shared/errors.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
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
    network: "base-sepolia",
    fulfillmentRevision: 3n,
    destinationAddress: "",
    transactionId: "",
};

describe("RewardsService", () => {
    it("lists awards through the authenticated transport", async () => {
        const authApi = unaryTransport({ awards: [award], nextPageToken: "next" });
        const service = new RewardsService({ authApi: authApi.transport });
        const signal = new AbortController().signal;

        await expect(
            service.listAwards({ limit: 100, pageToken: " cursor " }, { signal }),
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
                    network: "base-sepolia",
                    fulfillmentRevision: "3",
                    destinationAddress: "",
                    transactionId: "",
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

        await expect(service.listAwards()).resolves.toMatchObject({
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

        await expect(service.listAwards(input as never)).rejects.toBeInstanceOf(ValidationError);
        expect(authApi.calls).toHaveLength(0);
    });

    it("sets a destination with the step-up token and returns the updated award", async () => {
        const authApi = unaryTransport({
            award: {
                ...award,
                fulfillmentRevision: 4n,
                fulfillmentState: Proto.RewardFulfillmentState.READY_FOR_PAYOUT,
                destinationAddress: "0xabc",
            },
        });
        const service = new RewardsService({ authApi: authApi.transport });

        await expect(
            service.setDestination(
                {
                    awardId: " award-1 ",
                    destinationAddress: " 0xabc ",
                    expectedRevision: "3",
                    requestId: " req-1 ",
                },
                { stepUpToken: "step-up" },
            ),
        ).resolves.toMatchObject({
            award: {
                awardId: "award-1",
                fulfillmentRevision: "4",
                fulfillmentState: "ready_for_payout",
                destinationAddress: "0xabc",
            },
        });

        expect(authApi.lastCall()?.method.name).toBe("SetMyRewardDestination");
        expect(authApi.lastCall()?.message).toEqual({
            awardId: "award-1",
            destinationAddress: "0xabc",
            expectedRevision: 3n,
            requestId: "req-1",
        });
        expect(new Headers(authApi.lastCall()?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "step-up",
        );
    });

    const destination = {
        awardId: "award-1",
        destinationAddress: "0xabc",
        expectedRevision: "3",
        requestId: "req-1",
    };

    it.each([
        { name: "blank award id", input: { ...destination, awardId: " " } },
        {
            name: "award id over 128 characters",
            input: { ...destination, awardId: "x".repeat(129) },
        },
        { name: "blank destination", input: { ...destination, destinationAddress: "" } },
        {
            name: "destination over 512 characters",
            input: { ...destination, destinationAddress: "x".repeat(513) },
        },
        { name: "zero revision", input: { ...destination, expectedRevision: "0" } },
        { name: "non-integer revision", input: { ...destination, expectedRevision: "1.5" } },
        { name: "blank request id", input: { ...destination, requestId: "" } },
        {
            name: "request id over 128 characters",
            input: { ...destination, requestId: "x".repeat(129) },
        },
        { name: "unknown key", input: { ...destination, extra: true } },
    ])("rejects destination with $name before calling the server", async ({ input }) => {
        const authApi = unaryTransport({ award });
        const service = new RewardsService({ authApi: authApi.transport });

        await expect(service.setDestination(input as never)).rejects.toBeInstanceOf(
            ValidationError,
        );
        expect(authApi.calls).toHaveLength(0);
    });
});
