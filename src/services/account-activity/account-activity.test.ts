import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import * as ProtoApiKeys from "../../gen/auth/v1/api_keys_pb.js";
import * as ProtoPolicies from "../../gen/auth/v1/policies_pb.js";
import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import { ValidationError } from "../../shared/errors.js";
import { unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { AccountActivityService } from "./account-activity.js";

function serviceWith(response: Record<string, unknown> = {}) {
    const transport = unaryTransport(response);
    return { transport, service: new AccountActivityService({ authApi: transport.transport }) };
}

describe("AccountActivityService", () => {
    it("lists events with mapped filters and decodes actors, items and details", async () => {
        const keyId = "ak_1234567890abcdef1234567890abcdef";
        const { transport, service } = serviceWith({
            events: [
                create(Proto.ActivityEventSchema, {
                    createdAt: { seconds: 1_700_000_000n, nanos: 0 },
                    entityKind: Proto.ActivityEntityKind.ACTIVITY_ENTITY_API_KEY,
                    eventAction: Proto.ActivityEventAction.ACTIVITY_ACTION_UPDATED,
                    source: Proto.ActivityEventSource.ACTIVITY_SOURCE_API,
                    ip: "203.0.113.7",
                    userAgent: "sdk",
                    actor: {
                        kind: Proto.ActivityActorKind.ACTIVITY_ACTOR_API_KEY,
                        accountId: 7n,
                        username: "alice",
                        apiKeyId: keyId,
                        apiKeyKind: Proto.ActivityApiKeyKind.ACTIVITY_KEY_STRATEGY_BOT,
                        apiKeyLabel: "bot key",
                    },
                    item: { id: { case: "apiKeyId", value: keyId }, name: "bot key" },
                    details: {
                        kind: {
                            case: "apiKey",
                            value: {
                                label: { from: "", to: "bot key" },
                                status: {
                                    from: ProtoApiKeys.ApiKeyStatus.ACTIVE,
                                    to: ProtoApiKeys.ApiKeyStatus.DISABLED,
                                },
                                ipAllowlist: { added: ["10.0.0.0/8"], removed: [] },
                                expiresAt: { to: { seconds: 1_800_000_000n, nanos: 0 } },
                                apiPolicyId: { fromId: 0n, toId: 11n },
                                strategyBotId: 99n,
                            },
                        },
                    },
                }),
                create(Proto.ActivityEventSchema, {
                    entityKind: Proto.ActivityEntityKind.ACTIVITY_ENTITY_POLICY,
                    eventAction: Proto.ActivityEventAction.ACTIVITY_ACTION_UPDATED,
                    source: Proto.ActivityEventSource.ACTIVITY_SOURCE_SYSTEM,
                    subaccountId: 42n,
                    actor: {
                        kind: Proto.ActivityActorKind.ACTIVITY_ACTOR_SYSTEM,
                        systemReason:
                            Proto.ActivitySystemReason.ACTIVITY_SYSTEM_ASSISTANT_PRESET_UPDATED,
                    },
                    item: { id: { case: "subaccountPolicyId", value: 11n }, name: "AI read only" },
                    details: {
                        kind: {
                            case: "policy",
                            value: {
                                actions: {
                                    added: [ProtoPolicies.PolicyAction.TRADE_SPOT],
                                    removed: [ProtoPolicies.PolicyAction.READ_BALANCES],
                                },
                                maxOrderNotional: { from: 0n, to: 100_000_500_000n },
                                maxOpenOrders: { from: 5n, to: 10n },
                                assistantPreset: ProtoApiKeys.AssistantKeyPreset.READ_ONLY,
                                sourceTemplateId: 3n,
                                sourceTemplateRevision: 4n,
                            },
                        },
                    },
                }),
                create(Proto.ActivityEventSchema, {
                    entityKind: Proto.ActivityEntityKind.ACTIVITY_ENTITY_SESSION,
                    eventAction: Proto.ActivityEventAction.ACTIVITY_ACTION_FAILED,
                    source: Proto.ActivityEventSource.ACTIVITY_SOURCE_WEB,
                    actor: { kind: Proto.ActivityActorKind.ACTIVITY_ACTOR_UNAUTHENTICATED },
                    item: { name: "Chrome on macOS" },
                    details: {
                        kind: {
                            case: "session",
                            value: {
                                method: Proto.ActivitySignInMethod.ACTIVITY_SIGN_IN_WALLET,
                                walletAddress: "0xabc",
                                failure: Proto.ActivitySignInFailure.CHALLENGE_EXPIRED,
                            },
                        },
                    },
                }),
                create(Proto.ActivityEventSchema, {
                    entityKind: Proto.ActivityEntityKind.ACTIVITY_ENTITY_INVITE,
                    eventAction: Proto.ActivityEventAction.ACTIVITY_ACTION_CREATED,
                    source: Proto.ActivityEventSource.ACTIVITY_SOURCE_WEB,
                    actor: { kind: Proto.ActivityActorKind.ACTIVITY_ACTOR_USER, accountId: 7n },
                    item: { id: { case: "inviteId", value: 5n } },
                    details: {
                        kind: {
                            case: "invite",
                            value: {
                                granteeAccountId: 6n,
                                role: Proto.SubaccountRole.TRADER,
                                status: {
                                    from: Proto.SubaccountInviteStatus.UNSPECIFIED,
                                    to: Proto.SubaccountInviteStatus.PENDING,
                                },
                            },
                        },
                    },
                }),
                create(Proto.ActivityEventSchema, {
                    entityKind: Proto.ActivityEntityKind.ACTIVITY_ENTITY_DESTINATION,
                    eventAction: Proto.ActivityEventAction.ACTIVITY_ACTION_UPDATED,
                    source: Proto.ActivityEventSource.ACTIVITY_SOURCE_MOBILE,
                    actor: { kind: Proto.ActivityActorKind.ACTIVITY_ACTOR_USER, accountId: 7n },
                    item: { id: { case: "addressBookEntryId", value: 8n }, name: "Cold wallet" },
                    details: {
                        kind: {
                            case: "destination",
                            value: {
                                noteChanged: true,
                                tagIds: { addedIds: [2n], removedIds: [] },
                            },
                        },
                    },
                }),
                // Recorded before items and details were.
                create(Proto.ActivityEventSchema, {
                    entityKind: Proto.ActivityEntityKind.ACTIVITY_ENTITY_SUBACCOUNT,
                    eventAction: Proto.ActivityEventAction.ACTIVITY_ACTION_DELETED,
                    source: Proto.ActivityEventSource.ACTIVITY_SOURCE_WEB,
                    actor: { kind: Proto.ActivityActorKind.ACTIVITY_ACTOR_USER, accountId: 7n },
                }),
            ],
            nextPageToken: "next",
        });

        const page = await service.list({
            subaccountIds: [formatId(42n)],
            includeMainAccount: true,
            entityKinds: ["session", "policy"],
            eventActions: ["created"],
            sources: ["api", "system"],
            apiKeyId: keyId,
            startTime: 1_700_000_000_000,
            endTime: 1_700_000_060_500,
            limit: 200,
            pageToken: " p ",
        });

        expect(transport.lastCall()?.method.name).toBe("ListAccountActivity");
        expect(transport.lastCall()?.message).toEqual({
            subaccountIds: [42n],
            includeMainAccount: true,
            entityKinds: [
                Proto.ActivityEntityKind.ACTIVITY_ENTITY_SESSION,
                Proto.ActivityEntityKind.ACTIVITY_ENTITY_POLICY,
            ],
            eventActions: [Proto.ActivityEventAction.ACTIVITY_ACTION_CREATED],
            sources: [
                Proto.ActivityEventSource.ACTIVITY_SOURCE_API,
                Proto.ActivityEventSource.ACTIVITY_SOURCE_SYSTEM,
            ],
            apiKeyId: keyId,
            startTime: { seconds: 1_700_000_000n, nanos: 0 },
            endTime: { seconds: 1_700_000_060n, nanos: 500_000_000 },
            limit: 200,
            pageToken: "p",
        });
        expect(page.nextPageToken).toBe("next");
        const [apiKey, policy, session, invite, destination, legacy] = page.events;
        expect(apiKey).toEqual({
            createdAt: 1_700_000_000_000,
            entityKind: "api_key",
            eventAction: "updated",
            source: "api",
            ip: "203.0.113.7",
            userAgent: "sdk",
            subaccountId: undefined,
            actor: {
                kind: "api_key",
                accountId: formatId(7n),
                username: "alice",
                apiKeyId: keyId,
                apiKeyKind: "strategy_bot",
                apiKeyLabel: "bot key",
                systemReason: "unspecified",
            },
            item: { type: "api_key", id: keyId, name: "bot key" },
            details: {
                type: "api_key",
                label: { from: "", to: "bot key" },
                status: { from: "active", to: "disabled" },
                purpose: undefined,
                icon: undefined,
                color: undefined,
                ipAllowlist: { added: ["10.0.0.0/8"], removed: [] },
                expiresAt: { from: undefined, to: 1_800_000_000_000 },
                apiPolicyId: { fromId: undefined, toId: formatId(11n) },
                strategyBotId: formatId(99n),
            },
        });
        expect(policy).toMatchObject({
            source: "system",
            subaccountId: formatId(42n),
            actor: {
                kind: "system",
                accountId: undefined,
                systemReason: "assistant_preset_updated",
            },
            item: { type: "subaccount_policy", id: formatId(11n), name: "AI read only" },
            details: {
                type: "policy",
                actions: { added: ["trade-spot"], removed: ["read-balances"] },
                maxOrderNotional: { from: "0", to: "100000.5" },
                maxOpenOrders: { from: 5, to: 10 },
                assistantPreset: "read_only",
                sourceTemplateId: formatId(3n),
                sourceTemplateRevision: "4",
                subaccountPolicyId: undefined,
                strategyBotId: undefined,
            },
        });
        expect(session).toMatchObject({
            actor: { kind: "unauthenticated", accountId: undefined },
            item: { type: "unspecified", id: undefined, name: "Chrome on macOS" },
            details: {
                type: "session",
                method: "wallet",
                walletAddress: "0xabc",
                failure: "challenge_expired",
                scopes: [],
                elevatedAction: "unspecified",
            },
        });
        expect(invite).toMatchObject({
            actor: { kind: "user", accountId: formatId(7n) },
            item: { type: "invite", id: formatId(5n), name: "" },
            details: {
                type: "invite",
                granteeAccountId: formatId(6n),
                role: "trader",
                brokerRole: "unspecified",
                status: { from: "unspecified", to: "pending" },
            },
        });
        expect(destination).toMatchObject({
            item: { type: "address_book_entry", id: formatId(8n), name: "Cold wallet" },
            details: {
                type: "destination",
                label: undefined,
                noteChanged: true,
                tagIds: { addedIds: [formatId(2n)], removedIds: [] },
            },
        });
        expect(legacy).toMatchObject({ item: undefined, details: undefined });
    });

    it("sends an empty request and returns an empty page when nothing matches", async () => {
        const { transport, service } = serviceWith({});
        await expect(service.list()).resolves.toEqual({ events: [], nextPageToken: "" });
        expect(transport.lastCall()?.message).toEqual({});
    });

    it.each([
        ["a zero limit", { limit: 0 }],
        ["a limit over 200", { limit: 201 }],
        ["an unknown entity kind", { entityKinds: ["wallet"] }],
        ["a negative start time", { startTime: -1 }],
    ])("rejects %s before sending", async (_name, input) => {
        const { transport, service } = serviceWith();
        await expect(service.list(input as never)).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });
});
