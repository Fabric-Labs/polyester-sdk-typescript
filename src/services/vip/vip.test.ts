import { describe, expect, it } from "vitest";
import { unaryTransport } from "../../testing/service-harness.js";
import { VipService } from "./vip.js";

const effectiveFrom = { seconds: 1_700_000_000n, nanos: 0 };

function vipTier(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        tier: 1,
        volumeThresholdUsd: "100000",
        aopThresholdUsd: "25000",
        makerFeeRatePercent: "0.02",
        takerFeeRatePercent: "0.05",
        ...overrides,
    };
}

describe("VipService", () => {
    it("lists the public VIP catalog from the public transport", async () => {
        const publicApi = unaryTransport({
            policyVersion: 3n,
            effectiveFrom,
            retentionThresholdBp: 8000,
            tiers: [vipTier({ tier: 0, aopThresholdUsd: undefined }), vipTier()],
        });
        const authApi = unaryTransport({});
        const service = new VipService({
            publicApi: publicApi.transport,
            authApi: authApi.transport,
        });
        const signal = new AbortController().signal;

        await expect(service.listTiers({ signal })).resolves.toEqual({
            policyVersion: "3",
            effectiveFrom: 1_700_000_000_000,
            retentionThresholdBp: 8000,
            tiers: [
                {
                    tier: 0,
                    volumeThresholdUsd: "100000",
                    makerFeeRatePercent: "0.02",
                    takerFeeRatePercent: "0.05",
                },
                {
                    tier: 1,
                    volumeThresholdUsd: "100000",
                    aopThresholdUsd: "25000",
                    makerFeeRatePercent: "0.02",
                    takerFeeRatePercent: "0.05",
                },
            ],
        });

        expect(publicApi.lastCall()?.message).toEqual({});
        expect(publicApi.lastCall()?.signal).toBe(signal);
        expect(authApi.calls).toHaveLength(0);
    });

    it("reads authenticated VIP status from the auth transport", async () => {
        const publicApi = unaryTransport({});
        const authApi = unaryTransport({
            tier: 2,
            volumeTier: 3,
            aopTier: 1,
            settledVolume30dUsd: "150000.25",
            averageAop30dUsd: "40000",
            policyVersion: 3n,
            policyEffectiveFrom: effectiveFrom,
            effectiveFrom,
            evaluatedAt: { seconds: 1_700_000_100n, nanos: 0 },
            metricsAsOf: { seconds: 1_700_000_050n, nanos: 0 },
            nextTierThresholds: {
                tier: 3,
                volumeThresholdUsd: "500000",
                aopThresholdUsd: "100000",
            },
        });
        const service = new VipService({
            publicApi: publicApi.transport,
            authApi: authApi.transport,
        });

        await expect(service.getStatus()).resolves.toEqual({
            tier: 2,
            volumeTier: 3,
            aopTier: 1,
            settledVolume30dUsd: "150000.25",
            averageAop30dUsd: "40000",
            policyVersion: "3",
            policyEffectiveFrom: 1_700_000_000_000,
            effectiveFrom: 1_700_000_000_000,
            evaluatedAt: 1_700_000_100_000,
            metricsAsOf: 1_700_000_050_000,
            nextTierThresholds: {
                tier: 3,
                volumeThresholdUsd: "500000",
                aopThresholdUsd: "100000",
            },
        });

        expect(authApi.lastCall()?.message).toEqual({});
        expect(publicApi.calls).toHaveLength(0);
    });
});
