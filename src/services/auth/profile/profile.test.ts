import type { Transport } from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import * as Proto from "../../../gen/auth/v1/profile_pb.js";
import type { RealtimeClient } from "../../../realtime/client.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../../shared/request-options.js";
import { formatId } from "../../../utils/base58-id.js";
import { ProfileService } from "./profile.js";
import {
    AccountIdentitySchema,
    ProfileSchema,
    UpdateProfileInputSchema,
} from "./profile.schemas.js";

type CapturedCall = {
    message: Record<string, unknown>;
    signal: AbortSignal | undefined;
    headers: HeadersInit | undefined;
};

type IdentitySubscriptionParams = {
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

function profile(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        username: "alice",
        bio: "maker",
        website: "https://example.com",
        twitter: "alice",
        discord: "alice#1234",
        avatarUrl: "https://example.com/avatar.png",
        createdAt: { seconds: 1n, nanos: 0 },
        nextUsernameChangeAt: { seconds: 2n, nanos: 0 },
        vipTier: 3,
        ...overrides,
    };
}

function stepUpHeader(call: CapturedCall | undefined): string | null {
    return new Headers(call?.headers).get(AUTH_STEP_UP_HEADER_NAME);
}

describe("ProfileService", () => {
    it("gets the profile with an empty request and parses defaults", async () => {
        const calls: CapturedCall[] = [];
        const signal = new AbortController().signal;
        const realtime = realtimeMock();
        const service = new ProfileService(
            transportWithMessages(
                [
                    profile({
                        twitterVerified: undefined,
                        discordVerified: undefined,
                        usernameUnlocked: undefined,
                    }),
                ],
                calls,
            ),
            realtime.client,
        );

        await expect(service.get({ signal })).resolves.toMatchObject({
            username: "alice",
            twitterVerified: false,
            discordVerified: false,
            usernameUnlocked: false,
            createdAt: 1000,
            nextUsernameChangeAt: 2000,
        });
        expect(calls[0]?.message).toEqual({});
        expect(calls[0]?.signal).toBe(signal);
    });

    it("updates mutable profile fields without forwarding readonly fields", async () => {
        const calls: CapturedCall[] = [];
        const realtime = realtimeMock();
        const service = new ProfileService(
            transportWithMessages([profile({ bio: "updated", website: "" })], calls),
            realtime.client,
        );

        await expect(
            service.update(
                {
                    bio: "updated",
                    website: "",
                    vipTier: 99,
                    twitterVerified: true,
                } as unknown as Parameters<ProfileService["update"]>[0],
                { stepUpToken: " fresh-token " },
            ),
        ).resolves.toMatchObject({
            bio: "updated",
            website: "",
        });

        expect(calls[0]?.message).toEqual({
            bio: "updated",
            website: "",
        });
        expect(stepUpHeader(calls[0])).toBe("fresh-token");
    });

    it("parses username history and rejects malformed profile responses", async () => {
        const calls: CapturedCall[] = [];
        const signal = new AbortController().signal;
        const realtime = realtimeMock();
        const service = new ProfileService(
            transportWithMessages(
                [
                    {
                        history: [
                            {
                                username: "alice",
                                setAt: { seconds: 3n, nanos: 0 },
                            },
                        ],
                    },
                    {},
                ],
                calls,
            ),
            realtime.client,
        );

        await expect(service.getUsernameHistory({ signal })).resolves.toEqual([
            {
                username: "alice",
                setAt: 3000,
            },
        ]);
        expect(calls[0]?.message).toEqual({});
        expect(calls[0]?.signal).toBe(signal);
        await expect(service.get()).rejects.toThrow();
    });

    it("subscribes to public identity publications and parses events", () => {
        const realtime = realtimeMock();
        const service = new ProfileService(transportWithMessages([]), realtime.client);
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();

        const unsubscribe = service.subscribeIdentity({
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        const params = realtime.connectProtoChannel.mock
            .calls[0]?.[0] as IdentitySubscriptionParams;
        expect(unsubscribe).toBe(realtime.unsubscribe);
        expect(params).toMatchObject({
            channel: "public:identity:updates:proto",
            schema: Proto.AccountIdentitySchema,
        });

        params.onConnected();
        params.onDisconnected();
        params.onError({ type: "subscription" });
        params.onPublication({
            accountId: 9n,
            username: "alice",
            avatarUrl: "https://example.com/avatar.png",
            rootSmartAccountAddress: "0xabc",
        });

        expect(onOpen).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith({ type: "subscription" });
        expect(onEvent).toHaveBeenCalledWith({
            accountId: formatId(9n),
            username: "alice",
            avatarUrl: "https://example.com/avatar.png",
            rootSmartAccountAddress: "0xabc",
        });
    });
});

describe("profile schemas", () => {
    it("parses profile timestamps, strips readonly update fields, and formats identities", () => {
        expect(v.parse(ProfileSchema, profile({ nextUsernameChangeAt: undefined }))).toMatchObject({
            createdAt: 1000,
            nextUsernameChangeAt: undefined,
        });

        const patch = v.parse(UpdateProfileInputSchema, {
            username: "alice",
            vipTier: 99,
            twitterVerified: true,
        });
        expect(patch).toEqual({
            username: "alice",
        });

        expect(
            v.parse(AccountIdentitySchema, {
                accountId: 10n,
                rootSmartAccountAddress: "0xabc",
            }),
        ).toEqual({
            accountId: formatId(10n),
            rootSmartAccountAddress: "0xabc",
        });
    });
});
