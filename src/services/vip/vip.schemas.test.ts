import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
    NextVipTierThresholdsSchema,
    VipStatusSchema,
    VipTierCatalogSchema,
} from "./vip.schemas.js";

const effectiveFrom = { seconds: 1_700_000_000n, nanos: 0 };

describe("VipTierCatalogSchema", () => {
    it("parses a complete catalog snapshot", () => {
        expect(
            v.parse(VipTierCatalogSchema, {
                policyVersion: 1n,
                effectiveFrom,
                retentionThresholdBp: 1,
                tiers: [
                    {
                        tier: 0,
                        volumeThresholdUsd: "0",
                        makerFeeRatePercent: "-0.01",
                        takerFeeRatePercent: "0.10",
                    },
                ],
            }),
        ).toEqual({
            policyVersion: "1",
            effectiveFrom: 1_700_000_000_000,
            retentionThresholdBp: 1,
            tiers: [
                {
                    tier: 0,
                    volumeThresholdUsd: "0",
                    makerFeeRatePercent: "-0.01",
                    takerFeeRatePercent: "0.10",
                },
            ],
        });
    });

    it("accepts tier numbers outside the current VIP0-VIP10 catalog", () => {
        expect(
            v.parse(VipTierCatalogSchema, {
                policyVersion: 1n,
                effectiveFrom,
                retentionThresholdBp: 8000,
                tiers: [
                    {
                        tier: 11,
                        volumeThresholdUsd: "0",
                        aopThresholdUsd: "1000",
                        makerFeeRatePercent: "0",
                        takerFeeRatePercent: "0",
                    },
                ],
            }).tiers[0]?.tier,
        ).toBe(11);
    });

    it("requires AOP on VIP1+ and omits it on VIP0", () => {
        expect(() =>
            v.parse(VipTierCatalogSchema, {
                policyVersion: 1n,
                effectiveFrom,
                retentionThresholdBp: 8000,
                tiers: [
                    {
                        tier: 1,
                        volumeThresholdUsd: "0",
                        makerFeeRatePercent: "0",
                        takerFeeRatePercent: "0",
                    },
                ],
            }),
        ).toThrow();
        expect(
            v.parse(VipTierCatalogSchema, {
                policyVersion: 1n,
                effectiveFrom,
                retentionThresholdBp: 8000,
                tiers: [
                    {
                        tier: 0,
                        volumeThresholdUsd: "0",
                        makerFeeRatePercent: "0",
                        takerFeeRatePercent: "0",
                    },
                ],
            }).tiers[0],
        ).toEqual({
            tier: 0,
            volumeThresholdUsd: "0",
            makerFeeRatePercent: "0",
            takerFeeRatePercent: "0",
        });
    });

    it("rejects negative VIP tiers", () => {
        expect(() =>
            v.parse(VipTierCatalogSchema, {
                policyVersion: 1n,
                effectiveFrom,
                retentionThresholdBp: 8000,
                tiers: [
                    {
                        tier: -1,
                        volumeThresholdUsd: "0",
                        makerFeeRatePercent: "0",
                        takerFeeRatePercent: "0",
                    },
                ],
            }),
        ).toThrow();
    });

    it("rejects non-integer tiers and out-of-range retention thresholds", () => {
        expect(() =>
            v.parse(VipTierCatalogSchema, {
                policyVersion: 1n,
                effectiveFrom,
                retentionThresholdBp: 8000,
                tiers: [
                    {
                        tier: 1.5,
                        volumeThresholdUsd: "0",
                        makerFeeRatePercent: "0",
                        takerFeeRatePercent: "0",
                    },
                ],
            }),
        ).toThrow();
        expect(() =>
            v.parse(VipTierCatalogSchema, {
                policyVersion: 1n,
                effectiveFrom,
                retentionThresholdBp: 0,
                tiers: [],
            }),
        ).toThrow();
    });
});

describe("NextVipTierThresholdsSchema", () => {
    it("requires the next tier to be at least 1", () => {
        expect(() =>
            v.parse(NextVipTierThresholdsSchema, {
                tier: 0,
                volumeThresholdUsd: "1000",
                aopThresholdUsd: "1000",
            }),
        ).toThrow();
    });
});

describe("VipStatusSchema", () => {
    it("omits optional qualification fields when the backend leaves them unset", () => {
        expect(
            v.parse(VipStatusSchema, {
                tier: 0,
                volumeTier: 0,
                aopTier: 0,
                policyVersion: 1n,
                policyEffectiveFrom: effectiveFrom,
            }),
        ).toEqual({
            tier: 0,
            volumeTier: 0,
            aopTier: 0,
            policyVersion: "1",
            policyEffectiveFrom: 1_700_000_000_000,
        });
    });
});
