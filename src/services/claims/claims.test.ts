import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/claims/v1/claims_pb.js";
import { ValidationError } from "../../shared/errors.js";
import { unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
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
        await expect(service.claimDailyReward({}, { signal })).resolves.toMatchObject({
            claimId: "claim-1",
            state: "claimed",
            rewards: [{ assetId: 1, assetCode: "USDC", amount: "1" }],
            transfers: [{ assetId: 1, transferId: "transfer-1" }],
        });

        expect(authApi.calls.map((call) => call.message)).toEqual([{}, {}]);
        expect(authApi.lastCall()?.signal).toBe(signal);
    });

    it("pays a daily reward to the selected subaccount", async () => {
        const authApi = unaryTransport({
            claimId: "claim-1",
            state: Proto.DailyClaimState.CLAIM_PROCESSING,
            subaccountId: 7n,
        });
        const service = new ClaimsService({ authApi: authApi.transport });

        await expect(
            service.claimDailyReward({ subaccountId: formatId(7n) }),
        ).resolves.toMatchObject({ subaccountId: formatId(7n) });

        expect(authApi.lastCall()?.message).toEqual({ subaccountId: 7n });
    });

    it("rejects a subaccount id that would pay the root account", async () => {
        const authApi = unaryTransport({ claimId: "", state: 0 });
        const service = new ClaimsService({ authApi: authApi.transport });

        // "1" is the base58 encoding of 0n, which the wire reads as the root account.
        await expect(service.claimDailyReward({ subaccountId: "1" })).rejects.toThrow(
            ValidationError,
        );
        await expect(
            // @ts-expect-error mutation options belong in the second argument
            service.claimDailyReward({ signal: new AbortController().signal }),
        ).rejects.toThrow(ValidationError);
        expect(authApi.calls).toEqual([]);
    });

    it("maps unknown server states to unspecified", async () => {
        const authApi = unaryTransport({ state: 99, rewards: [], claimId: "" });
        const service = new ClaimsService({ authApi: authApi.transport });

        await expect(service.getDailyClaimStatus()).resolves.toMatchObject({
            state: "unspecified",
        });
    });
});
