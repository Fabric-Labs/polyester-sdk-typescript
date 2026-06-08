import type { Transport } from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import type { RealtimeClient } from "../../realtime/client.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { formatId } from "../../utils/base58-id.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { ApiKeysService } from "./api-keys.js";
import {
    ApiKeyIdInputSchema,
    ApiKeysCreateInputSchema,
    ApiKeysUpdateInputSchema,
} from "./api-keys.schemas.js";

type CapturedCall = {
    message: Record<string, unknown>;
    signal: AbortSignal | undefined;
    headers: HeadersInit | undefined;
};

type ApiKeySubscriptionParams = {
    channel: string;
    schema: unknown;
    onPublication: (data: Record<string, unknown>) => void;
    onConnected: () => void;
    onDisconnected: () => void;
    onError: (ctx: Record<string, unknown>) => void;
};

function transportWithMessages(
    messages: Record<string, unknown>[],
    calls: CapturedCall[] = [],
): Transport {
    return {
        unary: vi.fn(async (...args: unknown[]) => {
            calls.push({
                signal: args[1] as AbortSignal | undefined,
                headers: args[3] as HeadersInit | undefined,
                message: args[4] as Record<string, unknown>,
            });
            return {
                message: messages.shift() ?? {},
                header: new Headers(),
                trailer: new Headers(),
                stream: false,
                service: undefined,
                method: undefined,
            };
        }),
        stream: vi.fn(),
    } as unknown as Transport;
}

function realtimeMock() {
    const unsubscribe = vi.fn();
    const connectProtoChannel = vi.fn((_params: unknown) => unsubscribe);
    return {
        client: { connectProtoChannel } as unknown as RealtimeClient,
        connectProtoChannel,
        unsubscribe,
    };
}

function apiKey(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        keyId: "ak_0123456789abcdef0123456789abcdef",
        label: "Desk key",
        ipWhitelist: ["127.0.0.1/32"],
        status: Proto.ApiKeyStatus.ACTIVE,
        createdAt: { seconds: 1n, nanos: 0 },
        publicKeyEd25519: new Uint8Array([1, 2, 3]),
        createdByActor: "alice",
        ...overrides,
    };
}

function stepUpHeader(call: CapturedCall | undefined): string | null {
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
                input: { subaccountId: " 7 " },
                expectedSubaccountId: 7n,
            },
            {
                input: { subaccountId: "" },
                expectedSubaccountId: undefined,
            },
        ];

        for (const { input, expectedSubaccountId } of cases) {
            const calls: CapturedCall[] = [];
            const signal = new AbortController().signal;
            const realtime = realtimeMock();
            const service = new ApiKeysService(
                transportWithMessages([{ apiKeys: [] }], calls),
                realtime.client,
                resolver,
            );

            await expect(service.list(input, { signal })).resolves.toEqual([]);

            if (expectedSubaccountId === undefined) {
                expect(calls[0]?.message).not.toHaveProperty("subaccountId");
            } else {
                expect(calls[0]?.message).toMatchObject({ subaccountId: expectedSubaccountId });
            }
            expect(calls[0]?.signal).toBe(signal);
        }
    });

    it("parses API key responses and returns null for empty key responses", async () => {
        const realtime = realtimeMock();
        const service = new ApiKeysService(
            transportWithMessages([
                { apiKeys: [apiKey({ subaccountId: 2n, policyId: 3n })] },
                { apiKey: apiKey({ lastUsedAt: { seconds: 2n, nanos: 0 } }) },
                {},
            ]),
            realtime.client,
        );

        await expect(service.list()).resolves.toEqual([
            expect.objectContaining({
                keyId: "ak_0123456789abcdef0123456789abcdef",
                status: "active",
                subaccountId: formatId(2n),
                policyId: formatId(3n),
                createdAt: 1000,
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
                    label: "Desk key",
                },
                expected: {
                    keyId: "ak_0123456789abcdef0123456789abcdef",
                    label: "Desk key",
                },
                absent: ["status", "ipWhitelist", "expiresAt"],
            },
            {
                input: {
                    keyId: "ak_0123456789abcdef0123456789abcdef",
                    status: "disabled",
                    ipWhitelist: [],
                    expiresAtIso: null,
                },
                expected: {
                    keyId: "ak_0123456789abcdef0123456789abcdef",
                    status: Proto.ApiKeyStatus.DISABLED,
                    ipWhitelist: { cidrs: [] },
                    expiresAt: { seconds: 0n, nanos: 0 },
                },
                absent: ["label"],
            },
            {
                input: {
                    keyId: "ak_0123456789abcdef0123456789abcdef",
                    ipWhitelist: ["127.0.0.1/32"],
                    expiresAtIso: "1970-01-01T00:00:01.250Z",
                },
                expected: {
                    keyId: "ak_0123456789abcdef0123456789abcdef",
                    ipWhitelist: { cidrs: ["127.0.0.1/32"] },
                    expiresAt: { seconds: 1n, nanos: 250000000 },
                },
                absent: ["label", "status"],
            },
        ];

        for (const { input, expected, absent } of updateCases) {
            const calls: CapturedCall[] = [];
            const realtime = realtimeMock();
            const service = new ApiKeysService(
                transportWithMessages([{ apiKey: apiKey() }], calls),
                realtime.client,
            );

            await service.update(input, { stepUpToken: " fresh-token " });

            expect(calls[0]?.message).toMatchObject(expected);
            for (const field of absent) {
                expect(calls[0]?.message).not.toHaveProperty(field);
            }
            expect(stepUpHeader(calls[0])).toBe("fresh-token");
        }

        const calls: CapturedCall[] = [];
        const signal = new AbortController().signal;
        const realtime = realtimeMock();
        const service = new ApiKeysService(
            transportWithMessages([{ apiKey: apiKey() }, {}, {}], calls),
            realtime.client,
        );

        await service.get({ keyId: " key-1 " }, { signal });
        await service.create(
            {
                label: "Maker key",
                subaccountId: " 9 ",
                publicKeyEd25519: publicKey,
            },
            { signal, stepUpToken: " create-token " },
        );
        await service.delete({ keyId: " key-1 " }, { stepUpToken: " delete-token " });

        expect(calls[0]?.message).toEqual({ keyId: "key-1" });
        expect(calls[0]?.signal).toBe(signal);
        expect(calls[1]?.message).toMatchObject({
            label: "Maker key",
            subaccountId: 9n,
            ipWhitelist: [],
            publicKeyEd25519: publicKey,
        });
        expect(calls[1]?.message).not.toHaveProperty("stepUpToken");
        expect(calls[1]?.signal).toBe(signal);
        expect(stepUpHeader(calls[1])).toBe("create-token");
        expect(calls[2]?.message).toEqual({ keyId: "key-1" });
        expect(stepUpHeader(calls[2])).toBe("delete-token");
    });

    it("rejects malformed API key responses", async () => {
        const realtime = realtimeMock();
        const service = new ApiKeysService(
            transportWithMessages([
                {
                    apiKey: apiKey({
                        status: Proto.ApiKeyStatus.API_KEY_STATUS_UNSPECIFIED,
                    }),
                },
            ]),
            realtime.client,
        );

        await expect(service.get({ keyId: "ak_0123456789abcdef0123456789abcdef" })).rejects.toThrow(
            "invalid status 0",
        );
    });

    it("subscribes to account API key publications and parses events", () => {
        const realtime = realtimeMock();
        const service = new ApiKeysService(transportWithMessages([]), realtime.client);
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

        const params = realtime.connectProtoChannel.mock.calls[0]?.[0] as ApiKeySubscriptionParams;
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
        expect(() =>
            params.onPublication(apiKey({ status: Proto.ApiKeyStatus.API_KEY_STATUS_UNSPECIFIED })),
        ).toThrow("invalid status 0");
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
            ipWhitelist: [],
        });

        const labelOnlyUpdate = v.parse(ApiKeysUpdateInputSchema, {
            keyId: " key-1 ",
            label: "Desk key",
        });
        expect(labelOnlyUpdate).toMatchObject({
            keyId: "key-1",
            label: "Desk key",
        });
        expect(labelOnlyUpdate).not.toHaveProperty("ipWhitelist");
        expect(labelOnlyUpdate).not.toHaveProperty("expiresAt");
    });
});
