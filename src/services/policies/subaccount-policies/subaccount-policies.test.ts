import * as Proto from "../../../gen/auth/v1/policies_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../../shared/request-options.js";
import { realtimeClientStub, unaryTransport } from "../../../testing/service-harness.js";
import { describe, expect, it, vi } from "vitest";
import { SubaccountPoliciesService } from "./subaccount-policies.js";

const timestamp = { seconds: 0n, nanos: 0 };

function subaccountPolicy() {
    return {
        id: 11n,
        name: "Trading policy",
        description: "Template",
        spotMarkets: [],
        perpMarkets: [],
        spotMarketScope: Proto.MarketScope_Value.ALL,
        perpMarketScope: Proto.MarketScope_Value.ALL,
        actions: [Proto.PolicyAction.READ_BALANCES],
        isTemplate: false,
        sourceTemplateId: 0n,
        globalNotionalCap: 100n,
        maxOrderNotional: 25n,
        maxOpenOrders: 5,
        maxOpenPositions: 2,
        globalPerpLeverageX: 3,
        dailyInternalTransferOutLimit: 10n,
        dailyWithdrawLimit: 20n,
        internalTransfersOwnOnly: true,
        enforceWithdrawWhitelist: false,
        tradingHalted: false,
        liquidationOnly: false,
        dailyLossLimit: 0n,
        intradayDrawdownLimitBps: 150,
        locked: false,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

describe("SubaccountPoliciesService", () => {
    it("normalizes list/get requests and parses policy responses", async () => {
        const responses = [{ policies: [subaccountPolicy()] }, { policy: subaccountPolicy() }];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const realtime = realtimeClientStub();
        const service = new SubaccountPoliciesService(transport.transport, realtime.realtime);
        const signal = new AbortController().signal;

        await expect(service.list({ signal })).resolves.toMatchObject([
            {
                id: "C",
                actions: ["read-balances"],
                globalExposureCap: 100,
                maxOrderSize: 25,
                intradayDrawdownLimitPct: 1.5,
            },
        ]);
        await expect(service.get(" 11 ", { signal })).resolves.toMatchObject({
            id: "C",
            name: "Trading policy",
        });

        expect(transport.calls[0]?.message).toEqual({});
        expect(transport.calls[0]?.signal).toBe(signal);
        expect(transport.calls[1]?.message).toEqual({ policyId: 11n });
    });

    it("returns null for missing get responses", async () => {
        const transport = unaryTransport({});
        const realtime = realtimeClientStub();
        const service = new SubaccountPoliciesService(transport.transport, realtime.realtime);

        await expect(service.get("11")).resolves.toBeNull();
        expect(transport.lastCall()?.message).toEqual({ policyId: 11n });
    });

    it("normalizes mutation requests and forwards step-up call metadata", async () => {
        const transport = unaryTransport({ policy: subaccountPolicy() });
        const realtime = realtimeClientStub();
        const service = new SubaccountPoliciesService(transport.transport, realtime.realtime);
        const cases = [
            {
                run: () =>
                    service.create(
                        {
                            name: "Trading policy",
                            spotMarketScope: "all",
                            perpMarketScope: "all",
                            actions: ["read-balances"],
                            globalExposureCap: 100,
                            maxOrderSize: 25,
                            globalLeverageCap: 3,
                            dailyInternalTransferLimit: 10,
                            dailyWithdrawLimit: 20,
                            intradayDrawdownLimitPct: 1.5,
                            subaccountId: "42",
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    name: "Trading policy",
                    spotMarketScope: Proto.MarketScope_Value.ALL,
                    perpMarketScope: Proto.MarketScope_Value.ALL,
                    actions: [Proto.PolicyAction.READ_BALANCES],
                    globalNotionalCap: 100n,
                    maxOrderNotional: 25n,
                    globalPerpLeverageX: 3,
                    dailyInternalTransferOutLimit: 10n,
                    dailyWithdrawLimit: 20n,
                    intradayDrawdownLimitBps: 150,
                    subaccountId: 42n,
                },
            },
            {
                run: () =>
                    service.update(
                        {
                            policyId: "11",
                            name: "Updated policy",
                            spotMarketScope: "allowlist",
                            spotMarkets: [{ symbol: "BTC-USDT" }],
                            perpMarketScope: "all",
                            dailyInternalTransferLimit: 0,
                            dailyWithdrawLimit: 0,
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    policyId: 11n,
                    name: "Updated policy",
                    spotMarketScope: Proto.MarketScope_Value.ALLOWLIST,
                    spotMarkets: [{ symbol: "BTC-USDT" }],
                    dailyInternalTransferOutLimit: 0n,
                    dailyWithdrawLimit: 0n,
                },
            },
            {
                run: () => service.delete(" 11 ", { stepUpToken: " fresh-token " }),
                expected: { policyId: 11n },
            },
            {
                run: () =>
                    service.apply(
                        {
                            subaccountId: "42",
                            policyId: null,
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { subaccountId: 42n },
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

    it("subscribes to account policy channels and parses publications", () => {
        const transport = unaryTransport({});
        const realtime = realtimeClientStub();
        const service = new SubaccountPoliciesService(transport.transport, realtime.realtime);
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();

        service.subscribePolicies({
            accountId: "acct-1",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("private:auth:subaccount-policies:acct-1:proto");
        expect(realtime.params?.schema).toBe(Proto.SubaccountPolicyViewSchema);

        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        realtime.params?.onError?.({
            channel: "private:auth:subaccount-policies:acct-1:proto",
            type: "transport",
            error: { code: 1, message: "failed" },
        });
        realtime.params?.onPublication(subaccountPolicy() as never);

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "C",
                actions: ["read-balances"],
            }),
        );
    });
});
