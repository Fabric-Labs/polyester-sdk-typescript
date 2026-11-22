import { describe, expect, it } from "vitest";
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
    it("lists events with mapped filters and decodes the main account and API key actor", async () => {
        const { transport, service } = serviceWith({
            events: [
                {
                    createdAt: { seconds: 1_700_000_000n, nanos: 0 },
                    entityKind: Proto.ActivityEntityKind.ACTIVITY_ENTITY_SESSION,
                    eventAction: Proto.ActivityEventAction.ACTIVITY_ACTION_CREATED,
                    source: Proto.ActivityEventSource.ACTIVITY_SOURCE_API,
                    ip: "203.0.113.7",
                    userAgent: "sdk",
                    actorAccountId: 7n,
                    payloadJson: '{"method":"wallet"}',
                    actorApiKeyId: 9n,
                },
                {
                    entityKind: Proto.ActivityEntityKind.ACTIVITY_ENTITY_POLICY,
                    eventAction: Proto.ActivityEventAction.ACTIVITY_ACTION_UPDATED,
                    source: Proto.ActivityEventSource.ACTIVITY_SOURCE_WEB,
                    // Zero is the unset fixed64: no recorded actor.
                    actorAccountId: 0n,
                    payloadJson: "{}",
                    subaccountId: 42n,
                    // Zero is the unset fixed64: a session actor.
                    actorApiKeyId: 0n,
                },
            ],
            nextPageToken: "next",
        });

        const page = await service.list({
            subaccountIds: [formatId(42n)],
            includeMainAccount: true,
            entityKinds: ["session", "policy"],
            eventActions: ["created"],
            sources: ["api", "web"],
            apiKeyId: formatId(9n),
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
                Proto.ActivityEventSource.ACTIVITY_SOURCE_WEB,
            ],
            apiKeyId: 9n,
            startTime: { seconds: 1_700_000_000n, nanos: 0 },
            endTime: { seconds: 1_700_000_060n, nanos: 500_000_000 },
            limit: 200,
            pageToken: "p",
        });
        expect(page.nextPageToken).toBe("next");
        expect(page.events[0]).toEqual({
            createdAt: 1_700_000_000_000,
            entityKind: "session",
            eventAction: "created",
            source: "api",
            ip: "203.0.113.7",
            userAgent: "sdk",
            actorAccountId: formatId(7n),
            payloadJson: { method: "wallet" },
            subaccountId: undefined,
            actorApiKeyId: formatId(9n),
        });
        expect(page.events[1]).toMatchObject({
            entityKind: "policy",
            subaccountId: formatId(42n),
            actorAccountId: undefined,
            actorApiKeyId: undefined,
        });
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
