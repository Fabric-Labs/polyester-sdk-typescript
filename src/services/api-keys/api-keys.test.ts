import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { realtimeClientStub, unaryTransportSequence } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { ApiKeysService } from "./api-keys.js";
import {
    ApiKeyIdInputSchema,
    ApiKeySchema,
    ApiKeysCreateInputSchema,
    ApiKeysUpdateInputSchema,
} from "./api-keys.schemas.js";

type ApiKeySubscriptionParams = {
    channel: string;
    schema: unknown;
    onPublication: (data: Record<string, unknown>) => void;
    onConnected: () => void;
    onDisconnected: () => void;
    onError: (ctx: Record<string, unknown>) => void;
};

function apiKey(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        keyId: "ak_0123456789abcdef0123456789abcdef",
        label: "Desk key",
        icon: "terminal",
        color: "blue",
        ipWhitelist: ["127.0.0.1/32"],
        status: Proto.ApiKeyStatus.ACTIVE,
        createdAt: { seconds: 1n, nanos: 0 },
        updatedAt: { seconds: 2n, nanos: 123 },
        publicKeyEd25519: new Uint8Array([1, 2, 3]),
        createdByActor: "alice",
        revision: 3n,
        ...overrides,
    };
}

function stepUpHeader(call: { headers: HeadersInit | undefined } | undefined): string | null {
    return new Headers(call?.headers).get(AUTH_STEP_UP_HEADER_NAME);
}

describe("ApiKeysService", () => {
    it("normalizes list subaccount scope and passes request signals", async () => {
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "42",
        };
        const cases = [
            {
                input: {},
                expectedSubaccountId: 42n,
            },
            {
                input: { account: { subaccountId: " 7 " } },
                expectedSubaccountId: 7n,
            },
            {
                input: { account: "main" },
                expectedSubaccountId: undefined,
            },
        ] as const;

        for (const { input, expectedSubaccountId } of cases) {
            const signal = new AbortController().signal;
            const realtime = realtimeClientStub();
            const transport = unaryTransportSequence([{ apiKeys: [] }]);
            const service = new ApiKeysService(transport.transport, realtime.realtime, resolver);

            await expect(service.list(input, { signal })).resolves.toEqual([]);

            if (expectedSubaccountId === undefined) {
                expect(transport.calls[0]?.message).not.toHaveProperty("subaccountId");
            } else {
                expect(transport.calls[0]?.message).toMatchObject({
                    subaccountId: expectedSubaccountId,
                });
            }
            expect(transport.calls[0]?.signal).toBe(signal);
        }
    });

    it("parses API key responses and returns null for empty key responses", async () => {
        const realtime = realtimeClientStub();
        const transport = unaryTransportSequence([
            { apiKeys: [apiKey({ subaccountId: 2n, policyId: 3n })] },
            { apiKey: apiKey({ lastUsedAt: { seconds: 2n, nanos: 0 } }) },
            {},
        ]);
        const service = new ApiKeysService(transport.transport, realtime.realtime);

        await expect(service.list()).resolves.toEqual([
            expect.objectContaining({
                keyId: "ak_0123456789abcdef0123456789abcdef",
                status: "active",
                icon: "terminal",
                color: "blue",
                subaccountId: formatId(2n),
                policyId: formatId(3n),
                createdAt: 1000,
                updatedAt: 2000,
                updatedAtNs: "2000000123",
                publicKeyHex: "010203",
            }),
        ]);
        await expect(
            service.get({ keyId: " ak_0123456789abcdef0123456789abcdef " }),
        ).resolves.toMatchObject({
            lastUsedAt: 2000,
        });
        await expect(
            service.get({ keyId: "ak_ffffffffffffffffffffffffffffffff" }),
        ).resolves.toBeNull();
    });

    it("normalizes get, create, delete, and update requests to proto payloads", async () => {
        const publicKey = new Uint8Array([9, 8, 7]);
        const updateCases: Array<{
            input: Parameters<ApiKeysService["update"]>[0];
            expected: Record<string, unknown>;
            absent: string[];
        }> = [
            {
                input: {
                    keyId: " ak_0123456789abcdef0123456789abcdef ",
                    expectedRevision: "3",
                    label: "Desk key",
                    icon: "terminal",
                    color: "blue",
                },
                expected: {
                    keyId: "ak_0123456789abcdef0123456789abcdef",
                    apiKey: { label: "Desk key", icon: "terminal", color: "blue" },
                    updateMask: { paths: ["label", "icon", "color"] },
                    expectedRevision: 3n,
                },
                absent: ["status", "ipWhitelist", "expiresAt"],
            },
            {
                input: {
                    keyId: "ak_0123456789abcdef0123456789abcdef",
                    expectedRevision: "3",
                    status: "disabled",
                    ipWhitelist: [],
                    expiresAtIso: null,
                },
                expected: {
                    keyId: "ak_0123456789abcdef0123456789abcdef",
                    apiKey: { status: Proto.ApiKeyStatus.DISABLED, ipWhitelist: [] },
                    updateMask: { paths: ["status", "ip_whitelist", "expires_at"] },
                    expectedRevision: 3n,
                },
                absent: ["label"],
            },
            {
                input: {
                    keyId: "ak_0123456789abcdef0123456789abcdef",
                    expectedRevision: "3",
                    ipWhitelist: ["127.0.0.1/32"],
                    expiresAtIso: "1970-01-01T00:00:01.250Z",
                },
                expected: {
                    keyId: "ak_0123456789abcdef0123456789abcdef",
                    apiKey: {
                        ipWhitelist: ["127.0.0.1/32"],
                        expiresAt: { seconds: 1n, nanos: 250000000 },
                    },
                    updateMask: { paths: ["ip_whitelist", "expires_at"] },
                    expectedRevision: 3n,
                },
                absent: ["label", "status"],
            },
        ];

        for (const { input, expected, absent } of updateCases) {
            const realtime = realtimeClientStub();
            const transport = unaryTransportSequence([{ apiKey: apiKey() }]);
            const service = new ApiKeysService(transport.transport, realtime.realtime);

            await service.update(input, { stepUpToken: " fresh-token " });

            expect(transport.calls[0]?.message).toMatchObject(expected);
            for (const field of absent) {
                expect(transport.calls[0]?.message.apiKey).not.toHaveProperty(field);
            }
            expect(stepUpHeader(transport.calls[0])).toBe("fresh-token");
        }

        const signal = new AbortController().signal;
        const realtime = realtimeClientStub();
        const transport = unaryTransportSequence([{ apiKey: apiKey() }, {}, {}]);
        const service = new ApiKeysService(transport.transport, realtime.realtime);

        await service.get({ keyId: " key-1 " }, { signal });
        await service.create(
            {
                label: "Maker key",
                icon: "wand",
                color: "violet",
                account: { subaccountId: " 9 " },
                publicKeyEd25519: publicKey,
            },
            { signal, stepUpToken: " create-token " },
        );
        await service.delete({ keyId: " key-1 " }, { stepUpToken: " delete-token " });

        expect(transport.calls[0]?.message).toEqual({ keyId: "key-1" });
        expect(transport.calls[0]?.signal).toBe(signal);
        expect(transport.calls[1]?.message).toMatchObject({
            label: "Maker key",
            icon: "wand",
            color: "violet",
            subaccountId: 9n,
            ipWhitelist: [],
            publicKeyEd25519: publicKey,
        });
        expect(transport.calls[1]?.message).not.toHaveProperty("stepUpToken");
        expect(transport.calls[1]?.signal).toBe(signal);
        expect(stepUpHeader(transport.calls[1])).toBe("create-token");
        expect(transport.calls[2]?.message).toEqual({ keyId: "key-1" });
        expect(stepUpHeader(transport.calls[2])).toBe("delete-token");
    });

    it("rejects malformed API key responses", async () => {
        const realtime = realtimeClientStub();
        const transport = unaryTransportSequence([
            {
                apiKey: apiKey({
                    status: 999 as Proto.ApiKeyStatus,
                }),
            },
        ]);
        const service = new ApiKeysService(transport.transport, realtime.realtime);

        await expect(service.get({ keyId: "ak_0123456789abcdef0123456789abcdef" })).rejects.toThrow(
            /received 999/,
        );
    });

    it("subscribes to account API key publications and parses events", () => {
        const realtime = realtimeClientStub();
        const service = new ApiKeysService(unaryTransportSequence([]).transport, realtime.realtime);
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();

        const unsubscribe = service.subscribe({
            accountId: "acct-1",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        const params = realtime.params as unknown as ApiKeySubscriptionParams;
        expect(unsubscribe).toBe(realtime.unsubscribe);
        expect(params).toMatchObject({
            channel: "private:auth:api-keys:acct-1:proto",
            schema: Proto.ApiKeySchema,
        });

        params.onConnected();
        params.onDisconnected();
        params.onError({ type: "subscription" });
        params.onPublication(apiKey({ subaccountId: 8n }));

        expect(onOpen).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith({ type: "subscription" });
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                subaccountId: formatId(8n),
                status: "active",
                publicKeyHex: "010203",
            }),
        );
        expect(() => params.onPublication(apiKey({ status: 999 as Proto.ApiKeyStatus }))).toThrow(
            /received 999/,
        );
    });
});

describe("api key input schemas", () => {
    it("parses key IDs, create defaults, and update field presence", () => {
        expect(v.parse(ApiKeyIdInputSchema, { keyId: " key-1 " })).toEqual({
            keyId: "key-1",
        });
        expect(
            v.parse(ApiKeysCreateInputSchema, {
                label: "Desk key",
                publicKeyEd25519: new Uint8Array([1]),
            }),
        ).toMatchObject({
            label: "Desk key",
            icon: "",
            color: "",
            ipWhitelist: [],
        });

        const labelOnlyUpdate = v.parse(ApiKeysUpdateInputSchema, {
            keyId: " key-1 ",
            expectedRevision: "3",
            label: "Desk key",
        });
        expect(labelOnlyUpdate).toMatchObject({
            keyId: "key-1",
            apiKey: { label: "Desk key" },
            updateMask: { paths: ["label"] },
            expectedRevision: 3n,
        });
        expect(labelOnlyUpdate.apiKey).not.toHaveProperty("ipWhitelist");
        expect(labelOnlyUpdate.apiKey).not.toHaveProperty("expiresAt");
        expect(() =>
            v.parse(ApiKeysUpdateInputSchema, {
                keyId: "key-1",
                expectedRevision: "3",
                status: "revoked",
            }),
        ).toThrow();

        expect(v.parse(ApiKeySchema, apiKey({ status: Proto.ApiKeyStatus.REVOKED }))).toMatchObject(
            {
                status: "revoked",
            },
        );
    });
});
