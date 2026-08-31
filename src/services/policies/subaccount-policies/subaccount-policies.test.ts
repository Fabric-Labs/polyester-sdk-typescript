import * as Proto from "../../../gen/auth/v1/policies_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../../shared/request-options.js";
import { realtimeClientStub, unaryTransport } from "../../../testing/service-harness.js";
import { formatId } from "../../../utils/base58-id.js";
import { describe, expect, it, vi } from "vitest";
import type { SubaccountResolver } from "../../subaccount-resolver.js";
import { SubaccountPoliciesService } from "./subaccount-policies.js";

const createdAt = { seconds: 1n, nanos: 234_567_890 };
const updatedAt = { seconds: 2n, nanos: 345_678_901 };

function subaccountPolicy() {
    return {
        id: 11n,
        name: "Trading policy",
        description: "Template",
        spotMarkets: [],
        spotMarketScope: Proto.MarketScope_Value.ALL,
        actions: [Proto.PolicyAction.READ_BALANCES],
        isTemplate: false,
        sourceTemplateId: 0n,
        maxOrderNotional: 25_000_000n,
        maxOpenOrders: 5,
        tradingHalted: false,
        locked: false,
        createdAt,
        updatedAt,
        revision: 6n,
    };
}

describe("SubaccountPoliciesService", () => {
    it("normalizes list/get requests and parses policy responses", async () => {
        const responses = [{ policies: [subaccountPolicy()] }, { policy: subaccountPolicy() }];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const realtime = realtimeClientStub();
        const service = new SubaccountPoliciesService(
            { authApi: transport.transport },
            realtime.realtime,
        );
        const signal = new AbortController().signal;

        await expect(
            service.list({ account: { subaccountId: ` ${formatId(42n)} ` } }, { signal }),
        ).resolves.toMatchObject([
            {
                id: "C",
                actions: ["read-balances"],
                maxOrderSize: "25",
                createdAt: 1_234,
                updatedAt: 2_345,
                updatedAtNs: "2345678901",
            },
        ]);
        await expect(
            service.get(
                {
                    policyId: ` ${formatId(11n)} `,
                    account: { subaccountId: ` ${formatId(42n)} ` },
                },
                { signal },
            ),
        ).resolves.toMatchObject({
            id: "C",
            name: "Trading policy",
            createdAt: 1_234,
            updatedAt: 2_345,
            updatedAtNs: "2345678901",
        });

        expect(transport.calls[0]?.message).toEqual({ subaccountId: 42n });
        expect(transport.calls[0]?.signal).toBe(signal);
        expect(transport.calls[1]?.message).toEqual({ policyId: 11n, subaccountId: 42n });
    });

    it("returns null for missing get responses", async () => {
        const transport = unaryTransport({});
        const realtime = realtimeClientStub();
        const service = new SubaccountPoliciesService(
            { authApi: transport.transport },
            realtime.realtime,
        );

        await expect(service.get({ policyId: formatId(11n) })).resolves.toBeNull();
        expect(transport.lastCall()?.message).toEqual({ policyId: 11n });
    });

    it("resolves default and active scopes while preserving main and explicit policy scopes", async () => {
        const transport = unaryTransport({ policies: [] });
        const realtime = realtimeClientStub();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => formatId(42n),
        };
        const service = new SubaccountPoliciesService(
            { authApi: transport.transport },
            realtime.realtime,
            resolver,
        );

        await service.list();
        await service.list({ account: "active" });
        await service.list({ account: "main" });
        await service.list({ account: { subaccountId: formatId(11n) } });
        await service.get({ policyId: formatId(12n), account: "active" });

        expect(transport.calls.map((call) => call.message)).toEqual([
            { subaccountId: 42n },
            { subaccountId: 42n },
            {},
            { subaccountId: 11n },
            { policyId: 12n, subaccountId: 42n },
        ]);
    });

    it("normalizes mutation requests and forwards step-up call metadata", async () => {
        const transport = unaryTransport({ policy: subaccountPolicy() });
        const realtime = realtimeClientStub();
        const service = new SubaccountPoliciesService(
            { authApi: transport.transport },
            realtime.realtime,
        );
        const cases = [
            {
                run: () =>
                    service.create(
                        {
                            name: "Trading policy",
                            spotMarketScope: "all",
                            actions: ["read-balances", "read-spot"],
                            maxOrderSize: "25",
                            maxOpenOrders: 5,
                            subaccountId: formatId(42n),
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    policy: {
                        name: "Trading policy",
                        spotMarketScope: Proto.MarketScope_Value.ALL,
                        actions: [Proto.PolicyAction.READ_BALANCES, Proto.PolicyAction.READ_SPOT],
                        maxOrderNotional: 25_000_000n,
                        maxOpenOrders: 5,
                    },
                    subaccountId: 42n,
                },
            },
            {
                run: () =>
                    service.update(
                        {
                            policyId: formatId(11n),
                            expectedRevision: "6",
                            name: "Updated policy",
                            spotMarketScope: "allowlist",
                            spotMarkets: [{ symbolId: 101 }],
                            tradingHalted: false,
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    policyId: 11n,
                    policy: {
                        name: "Updated policy",
                        spotMarketScope: Proto.MarketScope_Value.ALLOWLIST,
                        spotMarkets: [{ symbolId: 101 }],
                        tradingHalted: false,
                    },
                    updateMask: {
                        paths: ["name", "spot_markets", "spot_market_scope", "trading_halted"],
                    },
                    expectedRevision: 6n,
                },
            },
            {
                run: () => service.delete(` ${formatId(11n)} `, { stepUpToken: " fresh-token " }),
                expected: { policyId: 11n },
            },
            {
                run: () =>
                    service.apply(
                        {
                            subaccountId: formatId(42n),
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

    it("scales maxOrderSize between decimal USDT and quote microunits", async () => {
        const transport = unaryTransport({
            policy: { ...subaccountPolicy(), maxOrderNotional: 100_000_000_000n },
        });
        const realtime = realtimeClientStub();
        const service = new SubaccountPoliciesService(
            { authApi: transport.transport },
            realtime.realtime,
        );

        // A 100,000 USDT cap must reach the wire as 100,000,000,000 microunits,
        // not as 100000 (which the engine reads as 0.1 USDT). See POLY-4796.
        await expect(
            service.create({
                name: "Trading policy",
                spotMarketScope: "all",
                maxOrderSize: "100000",
            }),
        ).resolves.toMatchObject({ maxOrderSize: "100000" });
        expect(transport.lastCall()?.message).toMatchObject({
            policy: { maxOrderNotional: 100_000_000_000n },
        });

        await service.update({
            policyId: formatId(11n),
            expectedRevision: "6",
            maxOrderSize: "100000.5",
        });
        expect(transport.lastCall()?.message).toMatchObject({
            policy: { maxOrderNotional: 100_000_500_000n },
            updateMask: { paths: ["max_order_notional"] },
        });

        // "0" is the no-cap sentinel and must stay 0 on the wire.
        await service.create({ name: "No cap", spotMarketScope: "all", maxOrderSize: "0" });
        expect(transport.lastCall()?.message).toMatchObject({
            policy: { maxOrderNotional: 0n },
        });

        // Scaled integers must not be accepted as if they were USDT.
        await expect(
            service.create({
                name: "Bad",
                spotMarketScope: "all",
                maxOrderSize: "1.0000005",
            }),
        ).rejects.toThrow();
    });

    it("subscribes to account policy channels and parses publications", () => {
        const transport = unaryTransport({});
        const realtime = realtimeClientStub();
        const service = new SubaccountPoliciesService(
            { authApi: transport.transport },
            realtime.realtime,
        );
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
                createdAt: 1_234,
                updatedAt: 2_345,
                updatedAtNs: "2345678901",
            }),
        );
    });
});
