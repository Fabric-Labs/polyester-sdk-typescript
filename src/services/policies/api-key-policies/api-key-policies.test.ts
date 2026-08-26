import * as Proto from "../../../gen/auth/v1/policies_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../../shared/request-options.js";
import { unaryTransport } from "../../../testing/service-harness.js";
import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
    ApplyApiKeyPolicyInputSchema,
    CreateApiKeyPolicyInputSchema,
    DEFAULT_API_KEY_POLICY,
    UpdateApiKeyPolicyInputSchema,
} from "./api-key-policies.schemas.js";
import { ApiKeyPoliciesService } from "./api-key-policies.js";

const createdAt = { seconds: 1n, nanos: 234_567_890 };
const updatedAt = { seconds: 2n, nanos: 345_678_901 };

function apiKeyPolicy() {
    return {
        id: 7n,
        name: "Restricted key",
        description: "Only reads balances",
        spotMarkets: [],
        spotMarketScope: Proto.MarketScope_Value.ALL,
        actions: [Proto.PolicyAction.READ_BALANCES],
        isTemplate: false,
        createdAt,
        updatedAt,
        revision: 5n,
    };
}

describe("ApiKeyPoliciesService", () => {
    it("returns the default API key policy without an RPC when no policy ID is supplied", async () => {
        const transport = unaryTransport({ policy: apiKeyPolicy() });
        const service = new ApiKeyPoliciesService(transport.transport);

        await expect(service.get({})).resolves.toEqual(DEFAULT_API_KEY_POLICY);
        expect(DEFAULT_API_KEY_POLICY).toMatchObject({
            createdAt: 0,
            updatedAt: 0,
            updatedAtNs: "0",
        });
        expect(() => JSON.stringify(DEFAULT_API_KEY_POLICY)).not.toThrow();
        expect(transport.unary).not.toHaveBeenCalled();
    });

    it("normalizes list/get requests and parses policy responses", async () => {
        const responses = [{ policies: [apiKeyPolicy()] }, { policy: apiKeyPolicy() }];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const service = new ApiKeyPoliciesService(transport.transport);
        const signal = new AbortController().signal;

        await expect(service.list({ keyId: " key-1 " }, { signal })).resolves.toMatchObject([
            {
                id: "8",
                actions: ["read-balances"],
                createdAt: 1_234,
                updatedAt: 2_345,
                updatedAtNs: "2345678901",
            },
        ]);
        await expect(
            service.get({ policyId: " 7 ", keyId: " key-1 " }, { signal }),
        ).resolves.toMatchObject({
            id: "8",
            name: "Restricted key",
            createdAt: 1_234,
            updatedAt: 2_345,
            updatedAtNs: "2345678901",
        });

        expect(transport.calls[0]?.message).toEqual({ keyId: "key-1" });
        expect(transport.calls[0]?.signal).toBe(signal);
        expect(transport.calls[1]?.message).toEqual({ policyId: 7n, keyId: "key-1" });
    });

    it("keeps missing get responses on the default policy contract", async () => {
        const transport = unaryTransport({});
        const service = new ApiKeyPoliciesService(transport.transport);

        await expect(service.get({ policyId: "9" })).resolves.toEqual(DEFAULT_API_KEY_POLICY);
        expect(transport.lastCall()?.message).toEqual({ policyId: 9n });
    });

    it("normalizes mutation requests and forwards step-up call metadata", async () => {
        const transport = unaryTransport({ policy: apiKeyPolicy() });
        const service = new ApiKeyPoliciesService(transport.transport);
        const cases = [
            {
                run: () =>
                    service.create(
                        {
                            name: "Key reads",
                            spotMarketScope: "all",
                            actions: ["read-balances"],
                            assignToKeyId: " ak_1234567890abcdef1234567890abcdef ",
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    policy: {
                        name: "Key reads",
                        spotMarketScope: Proto.MarketScope_Value.ALL,
                        actions: [Proto.PolicyAction.READ_BALANCES],
                    },
                    assignToKeyId: "ak_1234567890abcdef1234567890abcdef",
                },
            },
            {
                run: () =>
                    service.update(
                        {
                            policyId: "7",
                            expectedRevision: "5",
                            name: "Updated",
                            spotMarketScope: "allowlist",
                            spotMarkets: [{ symbol: "BTC-USDT" }],
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    policyId: 7n,
                    policy: {
                        name: "Updated",
                        spotMarketScope: Proto.MarketScope_Value.ALLOWLIST,
                        spotMarkets: [{ symbol: "BTC-USDT" }],
                    },
                    updateMask: {
                        paths: ["name", "spot_markets", "spot_market_scope"],
                    },
                    expectedRevision: 5n,
                },
            },
            {
                run: () => service.delete(" 7 ", { stepUpToken: " fresh-token " }),
                expected: { policyId: 7n },
            },
            {
                run: () =>
                    service.apply(
                        {
                            keyId: " ak_1234567890abcdef1234567890abcdef ",
                            policyId: null,
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { keyId: "ak_1234567890abcdef1234567890abcdef" },
            },
        ];

        for (const testCase of cases) {
            await testCase.run();
            const call = transport.lastCall();
            expect(call?.message).toMatchObject(testCase.expected);
            expect(new Headers(call?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
            expect(call?.message).not.toHaveProperty("stepUpToken");
        }
    });

    it("rejects retired policy limit fields", () => {
        expect(() =>
            v.parse(CreateApiKeyPolicyInputSchema, {
                name: "Create",
                spotMarketScope: "all",
                maxOrderNotional: 10,
            }),
        ).toThrow();

        expect(() =>
            v.parse(UpdateApiKeyPolicyInputSchema, {
                policyId: "7",
                expectedRevision: "5",
                name: "Update",
                dailyWithdrawLimit: 20,
            }),
        ).toThrow();
    });

    it("omits null policy IDs when clearing an API key policy", () => {
        expect(
            v.parse(ApplyApiKeyPolicyInputSchema, {
                keyId: " ak_1234567890abcdef1234567890abcdef ",
                policyId: null,
            }),
        ).toEqual({
            keyId: "ak_1234567890abcdef1234567890abcdef",
            policyId: undefined,
        });
    });
});
