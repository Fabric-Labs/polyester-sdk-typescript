import * as ProtoApiKeys from "../../gen/auth/v1/api_keys_pb.js";
import * as ProtoPolicies from "../../gen/auth/v1/policies_pb.js";
import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SUBACCOUNT_POLICY } from "../policies/subaccount-policies/index.js";
import { SubaccountsService } from "./subaccounts.js";

const timestamp = { seconds: 0n, nanos: 0 };

function subaccount(id = 42n) {
    return {
        id,
        role: Proto.SubaccountRole.OWNER,
        label: "Treasury",
        icon: "vault",
        color: "gold",
        status: "active",
        smartAccountAddress: "0x1111111111111111111111111111111111111111",
        ownerUsername: "owner",
        ownerAvatarUrl: "",
        ownerRootSmartAccountAddress: "0x2222222222222222222222222222222222222222",
        subaccountPolicyId: 11n,
        requireMemberMfa: true,
    };
}

function invite(subaccountId = 42n) {
    return {
        id: 5n,
        subaccountId,
        granteeAccountId: 6n,
        inviterAccountId: 7n,
        role: Proto.SubaccountRole.TRADER,
        status: Proto.SubaccountInviteStatus.PENDING,
        createdAt: timestamp,
        granteeUsername: "grantee",
        inviterUsername: "inviter",
        subaccountLabel: "Treasury",
        inviterRootSmartAccountAddress: "0x1111111111111111111111111111111111111111",
        granteeRootSmartAccountAddress: "0x2222222222222222222222222222222222222222",
        requireMemberMfa: true,
    };
}

function member() {
    return {
        accountId: 6n,
        role: Proto.SubaccountRole.TRADER,
        username: "member",
        smartAccountAddress: "0x3333333333333333333333333333333333333333",
        avatarUrl: "",
        mfaEnrolled: true,
    };
}

function subaccountPolicy() {
    return {
        id: 11n,
        name: "Trading policy",
        description: "Template",
        spotMarkets: [],
        perpMarkets: [],
        spotMarketScope: ProtoPolicies.MarketScope_Value.ALL,
        perpMarketScope: ProtoPolicies.MarketScope_Value.ALL,
        actions: [ProtoPolicies.PolicyAction.READ_BALANCES],
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

function apiKey() {
    return {
        keyId: "ak_1234567890abcdef1234567890abcdef",
        label: "read key",
        ipWhitelist: ["127.0.0.1/32"],
        subaccountId: 42n,
        policyId: 11n,
        createdAt: timestamp,
        publicKeyEd25519: new Uint8Array([1, 2, 3]),
        status: ProtoApiKeys.ApiKeyStatus.ACTIVE,
        createdByActor: "owner",
    };
}

describe("SubaccountsService", () => {
    it("lists subaccounts and propagates read call options", async () => {
        const transport = unaryTransport({ totalCreated: 3, subaccounts: [subaccount()] });
        const realtime = realtimeClientStub();
        const service = new SubaccountsService(transport.transport, realtime.realtime);
        const signal = new AbortController().signal;

        await expect(service.list({ signal })).resolves.toMatchObject({
            totalCreated: 3,
            subaccounts: [
                {
                    id: formatId(42n),
                    role: "owner",
                    icon: "vault",
                    color: "gold",
                    status: "active",
                    requireMemberMfa: true,
                },
            ],
        });

        expect(transport.lastCall()?.message).toEqual({});
        expect(transport.lastCall()?.signal).toBe(signal);
    });

    it("builds composite get requests, defaults missing related data, and filters invites", async () => {
        const transport = unaryTransport({
            subaccount: subaccount(),
            invites: [invite(42n), invite(99n)],
        });
        const realtime = realtimeClientStub();
        const service = new SubaccountsService(transport.transport, realtime.realtime);

        await expect(service.get({ subaccountId: " 42 " })).resolves.toMatchObject({
            id: formatId(42n),
            policy: DEFAULT_SUBACCOUNT_POLICY,
            apiKeys: [],
            members: [],
            invites: [
                {
                    id: formatId(5n),
                    subaccountId: formatId(42n),
                    role: "trader",
                    status: "pending",
                },
            ],
        });

        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 42n,
            includeApiKeys: true,
            includeBalances: true,
            includeMembers: true,
            includeInvites: true,
            includePolicy: true,
            invitesDirection: "outgoing",
        });
    });

    it("parses composite get response models when present", async () => {
        const transport = unaryTransport({
            subaccount: subaccount(),
            policy: subaccountPolicy(),
            apiKeys: [apiKey()],
            members: [member()],
            invites: [invite()],
        });
        const realtime = realtimeClientStub();
        const service = new SubaccountsService(transport.transport, realtime.realtime);

        await expect(service.get({ subaccountId: "42" })).resolves.toMatchObject({
            policy: { id: formatId(11n), actions: ["read-balances"] },
            apiKeys: [{ keyId: "ak_1234567890abcdef1234567890abcdef", publicKeyHex: "010203" }],
            members: [{ accountId: formatId(6n), role: "trader", mfaEnrolled: true }],
        });
    });

    it("throws when get omits the subaccount model", async () => {
        const transport = unaryTransport({});
        const realtime = realtimeClientStub();
        const service = new SubaccountsService(transport.transport, realtime.realtime);

        await expect(service.get({ subaccountId: "42" })).rejects.toThrow(
            `Subaccount not found: ${formatId(42n)}`,
        );
    });

    it("normalizes mutation requests, invite/member methods, and step-up call metadata", async () => {
        const transport = unaryTransport({
            subaccountId: 43n,
            totalCreated: 4,
            invite: invite(),
        });
        const realtime = realtimeClientStub();
        const service = new SubaccountsService(transport.transport, realtime.realtime);
        const cases = [
            {
                run: () =>
                    service.create(
                        {
                            label: "Trading",
                            icon: "chart",
                            color: "green",
                            smartAccountAddress: "0x1111111111111111111111111111111111111111",
                            nonce: "nonce",
                            signature: "signature",
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    label: "Trading",
                    icon: "chart",
                    color: "green",
                    smartAccountAddress: "0x1111111111111111111111111111111111111111",
                    nonce: "nonce",
                    signature: "signature",
                },
            },
            {
                run: () =>
                    service.update(
                        {
                            subaccountId: "42",
                            label: "Disabled",
                            icon: "pause",
                            color: "gray",
                            status: "disabled",
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    subaccountId: 42n,
                    label: "Disabled",
                    icon: "pause",
                    color: "gray",
                    status: "disabled",
                },
            },
            {
                run: () => service.delete({ subaccountId: "42" }, { stepUpToken: " fresh-token " }),
                expected: { subaccountId: 42n, status: "deleted" },
            },
            {
                run: () =>
                    service.inviteMember(
                        { subaccountId: "42", granteeAccountId: "6", role: "trader" },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    subaccountId: 42n,
                    granteeAccountId: 6n,
                    role: Proto.SubaccountRole.TRADER,
                },
            },
            {
                run: () =>
                    service.removeMember(
                        { subaccountId: "42", granteeAccountId: "6" },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { subaccountId: 42n, granteeAccountId: 6n },
            },
            {
                run: () =>
                    service.updateMemberRole(
                        { subaccountId: "42", granteeAccountId: "6", role: "viewer" },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    subaccountId: 42n,
                    granteeAccountId: 6n,
                    role: Proto.SubaccountRole.VIEWER,
                },
            },
            {
                run: () =>
                    service.setMemberMfaRequirement(
                        { subaccountId: "42", requireMemberMfa: true },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { subaccountId: 42n, requireMemberMfa: true },
            },
            {
                run: () =>
                    service.respondInvite(
                        { inviteId: "5", action: "accept" },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { inviteId: 5n, action: Proto.SubaccountInviteAction.ACCEPT },
            },
        ];

        for (const testCase of cases) {
            await testCase.run();
            const call = transport.lastCall();
            expect(call?.message).toMatchObject(testCase.expected);
            expect(new Headers(call?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        }

        await expect(
            service.create({
                label: "Trading",
                smartAccountAddress: "0x1111111111111111111111111111111111111111",
                nonce: "nonce",
                signature: "signature",
            }),
        ).resolves.toEqual({ subaccountId: formatId(43n), totalCreated: 4 });
        await expect(
            service.inviteMember({ subaccountId: "42", granteeAccountId: "6", role: "trader" }),
        ).resolves.toMatchObject({ id: formatId(5n), status: "pending" });
    });

    it("normalizes list invite/member/activity requests and parses responses", async () => {
        const responses = [
            { invites: [invite()] },
            { members: [member()] },
            {
                events: [
                    {
                        cursor: "event-1",
                        entityKind: "subaccount",
                        eventAction: "created",
                        source: "web",
                        actorAccountId: 7n,
                        payloadJson: '{"ok":true}',
                    },
                ],
                nextCursor: "next",
            },
        ];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const realtime = realtimeClientStub();
        const service = new SubaccountsService(transport.transport, realtime.realtime);

        await expect(service.listInvites({ direction: "incoming" })).resolves.toMatchObject([
            { id: formatId(5n), role: "trader" },
        ]);
        await expect(service.listMembers({ subaccountId: "42" })).resolves.toMatchObject([
            { accountId: formatId(6n), role: "trader" },
        ]);
        await expect(
            service.listEvents({ subaccountId: "42", limit: 25, cursor: "cursor-1" }),
        ).resolves.toEqual({
            events: [
                {
                    cursor: "event-1",
                    createdAt: undefined,
                    entityKind: "subaccount",
                    eventAction: "created",
                    source: "web",
                    actorAccountId: formatId(7n),
                    payloadJson: { ok: true },
                },
            ],
            nextCursor: "next",
        });

        expect(transport.calls.map((call) => call.message)).toEqual([
            { direction: "incoming" },
            { subaccountId: 42n },
            { subaccountId: 42n, limit: 25, cursor: "cursor-1" },
        ]);
    });

    it("subscribes to subaccount and API key channels and parses publications", () => {
        const transport = unaryTransport({});
        const realtime = realtimeClientStub();
        const service = new SubaccountsService(transport.transport, realtime.realtime);
        const onSubaccount = vi.fn();
        const onApiKey = vi.fn();

        service.subscribe({ accountId: "acct-1", onEvent: onSubaccount });
        expect(realtime.params?.channel).toBe("private:auth:subaccounts:acct-1:proto");
        expect(realtime.params?.schema).toBe(Proto.SubaccountSchema);
        realtime.params?.onPublication(subaccount() as never);
        expect(onSubaccount).toHaveBeenCalledWith(
            expect.objectContaining({ id: formatId(42n), role: "owner" }),
        );

        service.subscribeApiKeys({ accountId: "acct-1", onEvent: onApiKey });
        expect(realtime.params?.channel).toBe("private:auth:api-keys:acct-1:proto");
        expect(realtime.params?.schema).toBe(ProtoApiKeys.ApiKeySchema);
        realtime.params?.onPublication(apiKey() as never);
        expect(onApiKey).toHaveBeenCalledWith(
            expect.objectContaining({
                keyId: "ak_1234567890abcdef1234567890abcdef",
                publicKeyHex: "010203",
            }),
        );
    });
});
