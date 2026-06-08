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

const timestamp = { seconds: 0n, nanos: 0 };

function apiKeyPolicy() {
    return {
        id: 7n,
        name: "Restricted key",
        description: "Only reads balances",
        spotMarkets: [],
        perpMarkets: [],
        spotMarketScope: Proto.MarketScope_Value.ALL,
        perpMarketScope: Proto.MarketScope_Value.ALL,
        actions: [Proto.PolicyAction.READ_BALANCES],
        maxOrderNotional: 0n,
        dailyInternalTransferOutLimit: 25n,
        dailyWithdrawLimit: 50n,
        isTemplate: false,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

describe("ApiKeyPoliciesService", () => {
    it("returns the default API key policy without an RPC when no policy ID is supplied", async () => {
        const transport = unaryTransport({ policy: apiKeyPolicy() });
        const service = new ApiKeyPoliciesService(transport.transport);

        await expect(service.get(undefined)).resolves.toEqual(DEFAULT_API_KEY_POLICY);
        expect(transport.unary).not.toHaveBeenCalled();
    });

    it("normalizes list/get requests and parses policy responses", async () => {
        const responses = [{ policies: [apiKeyPolicy()] }, { policy: apiKeyPolicy() }];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const service = new ApiKeyPoliciesService(transport.transport);
        const signal = new AbortController().signal;

        await expect(service.list({ signal })).resolves.toMatchObject([
            {
                id: "8",
                actions: ["read-balances"],
                dailyInternalTransferOutLimit: 25,
            },
        ]);
        await expect(service.get(" 7 ", { signal })).resolves.toMatchObject({
            id: "8",
            name: "Restricted key",
        });

        expect(transport.calls[0]?.message).toEqual({});
        expect(transport.calls[0]?.signal).toBe(signal);
        expect(transport.calls[1]?.message).toEqual({ policyId: 7n });
    });

    it("keeps missing get responses on the default policy contract", async () => {
        const transport = unaryTransport({});
        const service = new ApiKeyPoliciesService(transport.transport);

        await expect(service.get("9")).resolves.toEqual(DEFAULT_API_KEY_POLICY);
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
                            perpMarketScope: "all",
                            actions: ["read-balances"],
                            dailyInternalTransferLimit: 25,
                            dailyWithdrawLimit: 50,
                            maxOrderNotional: null,
                            assignToKeyId: " ak_1234567890abcdef1234567890abcdef ",
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    name: "Key reads",
                    spotMarketScope: Proto.MarketScope_Value.ALL,
                    perpMarketScope: Proto.MarketScope_Value.ALL,
                    actions: [Proto.PolicyAction.READ_BALANCES],
                    maxOrderNotional: 0n,
                    dailyInternalTransferOutLimit: 25n,
                    dailyWithdrawLimit: 50n,
                    assignToKeyId: "ak_1234567890abcdef1234567890abcdef",
                },
            },
            {
                run: () =>
                    service.update(
                        {
                            policyId: "7",
                            name: "Updated",
                            spotMarketScope: "all",
                            perpMarketScope: "allowlist",
                            perpMarkets: [{ symbol: "BTC-PERP", maxLeverageX: 5 }],
                            dailyInternalTransferLimit: 0,
                            dailyWithdrawLimit: 0,
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    policyId: 7n,
                    name: "Updated",
                    spotMarketScope: Proto.MarketScope_Value.ALL,
                    perpMarketScope: Proto.MarketScope_Value.ALLOWLIST,
                    perpMarkets: [{ symbol: "BTC-PERP", maxLeverageX: 5 }],
                    dailyInternalTransferOutLimit: 0n,
                    dailyWithdrawLimit: 0n,
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

    it("schema parsing renames internal transfer input to the proto request field", () => {
        expect(
            v.parse(CreateApiKeyPolicyInputSchema, {
                name: "Create",
                spotMarketScope: "all",
                perpMarketScope: "all",
                dailyInternalTransferLimit: 10,
                dailyWithdrawLimit: 20,
            }),
        ).toMatchObject({
            dailyInternalTransferOutLimit: 10n,
        });

        expect(
            v.parse(UpdateApiKeyPolicyInputSchema, {
                policyId: "7",
                name: "Update",
                spotMarketScope: "all",
                perpMarketScope: "all",
                dailyInternalTransferLimit: 10,
                dailyWithdrawLimit: 20,
            }),
        ).toMatchObject({
            policyId: 7n,
            dailyInternalTransferOutLimit: 10n,
        });
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
