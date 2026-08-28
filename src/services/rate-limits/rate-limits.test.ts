import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/ratelimit/v1/ratelimit_pb.js";
import { subaccountResolverStub, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { RateLimitService } from "./rate-limits.js";

const effectiveFrom = { seconds: 1_700_000_000n, nanos: 0 };

function rule(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        policyClass: Proto.TradingRateLimitClass.PLACE,
        vipTier: 2,
        quotaWeight: 100n,
        periodMs: 1000n,
        burstWeight: 20n,
        ...overrides,
    };
}

describe("RateLimitService", () => {
    it("reads the public catalog from the public transport", async () => {
        const publicApi = unaryTransport({
            policyVersion: 7n,
            effectiveFrom,
            rules: [rule(), rule({ policyClass: Proto.TradingRateLimitClass.CANCEL, vipTier: 2 })],
        });
        const authApi = unaryTransport({});
        const service = new RateLimitService({
            publicApi: publicApi.transport,
            authApi: authApi.transport,
        });
        const signal = new AbortController().signal;

        await expect(service.getConfig({ signal })).resolves.toEqual({
            policyVersion: "7",
            effectiveFrom: 1_700_000_000_000,
            rules: [
                {
                    policyClass: "trading_place",
                    vipTier: 2,
                    quotaWeight: "100",
                    periodMs: "1000",
                    burstWeight: "20",
                },
                {
                    policyClass: "trading_cancel",
                    vipTier: 2,
                    quotaWeight: "100",
                    periodMs: "1000",
                    burstWeight: "20",
                },
            ],
        });

        expect(publicApi.lastCall()?.message).toEqual({});
        expect(publicApi.lastCall()?.signal).toBe(signal);
        expect(authApi.calls).toHaveLength(0);
    });

    it("resolves the account target and parses authenticated trading limits", async () => {
        const publicApi = unaryTransport({});
        const authApi = unaryTransport({
            policyVersion: 7n,
            effectiveFrom,
            rules: [rule()],
            apiKeyRules: [rule({ quotaWeight: 10n, burstWeight: 2n })],
        });
        const service = new RateLimitService(
            {
                publicApi: publicApi.transport,
                authApi: authApi.transport,
            },
            subaccountResolverStub(formatId(42n)),
        );

        await expect(service.getTradingLimits()).resolves.toEqual({
            policyVersion: "7",
            effectiveFrom: 1_700_000_000_000,
            rules: [
                {
                    policyClass: "trading_place",
                    vipTier: 2,
                    quotaWeight: "100",
                    periodMs: "1000",
                    burstWeight: "20",
                },
            ],
            apiKeyRules: [
                {
                    policyClass: "trading_place",
                    vipTier: 2,
                    quotaWeight: "10",
                    periodMs: "1000",
                    burstWeight: "2",
                },
            ],
        });

        expect(authApi.lastCall()?.message).toEqual({ subaccountId: 42n });
        expect(publicApi.calls).toHaveLength(0);
    });

    it("lets explicit main scope force root scope", async () => {
        const publicApi = unaryTransport({});
        const authApi = unaryTransport({
            policyVersion: 7n,
            effectiveFrom,
            rules: [rule()],
        });
        const service = new RateLimitService(
            {
                publicApi: publicApi.transport,
                authApi: authApi.transport,
            },
            subaccountResolverStub(formatId(42n)),
        );

        await expect(service.getTradingLimits({ account: "main" })).resolves.toMatchObject({
            policyVersion: "7",
        });
        expect(authApi.lastCall()?.message).toEqual({});
    });
});
