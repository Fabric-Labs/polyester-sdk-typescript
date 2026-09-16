import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/claims/v1/claims_pb.js";
import { ValidationError } from "../../shared/errors.js";
import { unaryTransport } from "../../testing/service-harness.js";
import { ClaimsService } from "./claims.js";

describe("ClaimsService", () => {
    it("gets daily status from the authenticated transport", async () => {
        const authApi = unaryTransport({
            state: Proto.DailyClaimState.CLAIM_AVAILABLE,
            resetAt: { seconds: 1_700_000_000n, nanos: 0 },
            rewards: [],
            claimId: "",
        });
        const service = new ClaimsService({ authApi: authApi.transport });
        const signal = new AbortController().signal;

        await expect(service.getDailyClaimStatus({ signal })).resolves.toMatchObject({
            state: "available",
            resetAt: 1_700_000_000_000,
        });

        expect(authApi.lastCall()?.message).toEqual({});
        expect(authApi.lastCall()?.signal).toBe(signal);
    });

    it("claims a daily reward through the authenticated transport", async () => {
        const authApi = unaryTransport((_call, index) => ({
            claimId: "claim-1",
            state:
                index === 0
                    ? Proto.DailyClaimState.CLAIM_PROCESSING
                    : Proto.DailyClaimState.CLAIM_CLAIMED,
            rewards: [
                {
                    assetId: 1,
                    assetCode: "USDC",
                    amountE18: { hi: 0n, lo: 1_000_000_000_000_000_000n },
                },
            ],
            transfers: index === 0 ? [] : [{ assetId: 1, transferId: "transfer-1" }],
        }));
        const service = new ClaimsService({ authApi: authApi.transport });
        const signal = new AbortController().signal;

        await expect(service.claimDailyReward()).resolves.toMatchObject({
            claimId: "claim-1",
            state: "processing",
            transfers: [],
        });
        await expect(service.claimDailyReward({ signal })).resolves.toMatchObject({
            claimId: "claim-1",
            state: "claimed",
            rewards: [{ assetId: 1, assetCode: "USDC", amount: "1" }],
            transfers: [{ assetId: 1, transferId: "transfer-1" }],
        });

        expect(authApi.calls.map((call) => call.message)).toEqual([{}, {}]);
        expect(authApi.lastCall()?.signal).toBe(signal);
    });

    it("rejects unknown server states as an SDK ValidationError", async () => {
        const authApi = unaryTransport({ state: 99, rewards: [], claimId: "" });
        const service = new ClaimsService({ authApi: authApi.transport });

        await expect(service.getDailyClaimStatus()).rejects.toBeInstanceOf(ValidationError);
    });
});
