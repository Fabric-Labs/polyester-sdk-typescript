import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import * as Proto from "../../../gen/auth/v1/profile_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../../shared/request-options.js";
import { realtimeClientStub, unaryTransportSequence } from "../../../testing/service-harness.js";
import { formatId } from "../../../utils/base58-id.js";
import { PROTOBUF_UINT32_MAX } from "../../../shared/wire-bounds.js";
import { ProfileService } from "./profile.js";
import {
    AccountIdentitySchema,
    ClaimGeneratedUsernameInputSchema,
    GeneratedUsernameOfferSchema,
    ProfileSchema,
    UpdateProfileInputSchema,
} from "./profile.schemas.js";

type IdentitySubscriptionParams = {
    channel: string;
    schema: unknown;
    onPublication: (data: Record<string, unknown>) => void;
    onConnected: () => void;
    onDisconnected: () => void;
    onError: (ctx: Record<string, unknown>) => void;
};

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

function stepUpHeader(call: { headers: HeadersInit | undefined } | undefined): string | null {
    return new Headers(call?.headers).get(AUTH_STEP_UP_HEADER_NAME);
}

describe("ProfileService", () => {
    it("gets the profile with an empty request and parses defaults", async () => {
        const signal = new AbortController().signal;
        const realtime = realtimeClientStub();
        const transport = unaryTransportSequence([
            profile({
                twitterVerified: undefined,
                discordVerified: undefined,
                usernameUnlocked: undefined,
            }),
        ]);
        const service = new ProfileService({ authApi: transport.transport }, realtime.realtime);

        await expect(service.get({ signal })).resolves.toMatchObject({
            username: "alice",
            twitterVerified: false,
            discordVerified: false,
            usernameUnlocked: false,
            createdAt: 1000,
            nextUsernameChangeAt: 2000,
        });
        expect(transport.calls[0]?.message).toEqual({});
        expect(transport.calls[0]?.signal).toBe(signal);
    });

    it("updates mutable profile fields without forwarding readonly fields", async () => {
        const realtime = realtimeClientStub();
        const transport = unaryTransportSequence([profile({ bio: "updated", website: "" })]);
        const service = new ProfileService({ authApi: transport.transport }, realtime.realtime);

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

        expect(transport.calls[0]?.message).toEqual({
            bio: "updated",
            website: "",
        });
        expect(stepUpHeader(transport.calls[0])).toBe("fresh-token");
    });

    it("parses username history and rejects malformed profile responses", async () => {
        const signal = new AbortController().signal;
        const realtime = realtimeClientStub();
        const transport = unaryTransportSequence([
            {
                history: [
                    {
                        username: "alice",
                        setAt: { seconds: 3n, nanos: 0 },
                    },
                ],
            },
            {},
        ]);
        const service = new ProfileService({ authApi: transport.transport }, realtime.realtime);

        await expect(service.getUsernameHistory({ signal })).resolves.toEqual([
            {
                username: "alice",
                setAt: 3000,
            },
        ]);
        expect(transport.calls[0]?.message).toEqual({});
        expect(transport.calls[0]?.signal).toBe(signal);
        await expect(service.get()).rejects.toThrow();
    });

    it("generates and claims a username offer", async () => {
        const signal = new AbortController().signal;
        const transport = unaryTransportSequence([
            {
                usernames: ["amber-fox", "brisk-owl", "calm-yak", "daring-ant", "eager-lynx"],
                offerToken: "offer-1",
                expiresAt: { seconds: 4n, nanos: 0 },
            },
            profile({ username: "calm-yak" }),
        ]);
        const service = new ProfileService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
        );

        await expect(service.generateUsernameOptions({ signal })).resolves.toEqual({
            usernames: ["amber-fox", "brisk-owl", "calm-yak", "daring-ant", "eager-lynx"],
            offerToken: "offer-1",
            expiresAt: 4000,
        });
        await expect(
            service.claimGeneratedUsername(
                { offerToken: "offer-1", optionIndex: 2 },
                { stepUpToken: " fresh-token " },
            ),
        ).resolves.toMatchObject({ username: "calm-yak" });

        expect(transport.calls[0]?.method.localName).toBe("generateUsernameOptions");
        expect(transport.calls[0]?.message).toEqual({});
        expect(transport.calls[0]?.signal).toBe(signal);
        expect(transport.calls[1]?.method.localName).toBe("claimGeneratedUsername");
        expect(transport.calls[1]?.message).toEqual({ offerToken: "offer-1", optionIndex: 2 });
        expect(stepUpHeader(transport.calls[1])).toBe("fresh-token");
    });

    it("subscribes to public identity publications and parses events", () => {
        const realtime = realtimeClientStub();
        const service = new ProfileService(
            { authApi: unaryTransportSequence([]).transport },
            realtime.realtime,
        );
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

        const params = realtime.params as unknown as IdentitySubscriptionParams;
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

    it("accepts variable-length username offers and enforces the claim index wire bound", () => {
        expect(
            v.parse(GeneratedUsernameOfferSchema, {
                usernames: ["one"],
                offerToken: "offer-1",
            }).usernames,
        ).toEqual(["one"]);
        expect(
            v.parse(ClaimGeneratedUsernameInputSchema, {
                offerToken: "offer-1",
                optionIndex: PROTOBUF_UINT32_MAX,
            }).optionIndex,
        ).toBe(PROTOBUF_UINT32_MAX);
        expect(() =>
            v.parse(ClaimGeneratedUsernameInputSchema, {
                offerToken: "offer-1",
                optionIndex: PROTOBUF_UINT32_MAX + 1,
            }),
        ).toThrow();
    });
});
