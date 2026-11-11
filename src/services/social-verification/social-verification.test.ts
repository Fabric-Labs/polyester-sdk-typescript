import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { AuthErrorCode } from "../../gen/auth/v1/auth_pb.js";
import * as Proto from "../../gen/auth/v1/social_verification_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { unaryTransportSequence } from "../../testing/service-harness.js";
import { SocialVerificationService } from "./social-verification.js";
import {
    SocialProviderInputSchema,
    StartVerificationInputSchema,
    transformVerification,
} from "./social-verification.schemas.js";

type StartVerificationCase = {
    input: Parameters<SocialVerificationService["start"]>[0];
    expected: {
        provider: Proto.SocialProvider;
        handle?: string;
        method: Proto.SocialVerificationMethod;
    };
};

function verification(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        id: 1n,
        provider: Proto.SocialProvider.TWITTER,
        method: Proto.SocialVerificationMethod.METHOD_PROFILE,
        handle: "alice",
        providerUserId: "twitter-1",
        challengeCode: "poly_123",
        status: Proto.SocialVerificationStatus.STATUS_PENDING_USER_ACTION,
        requestedAt: { seconds: 1n, nanos: 0 },
        expiresAt: { seconds: 2n, nanos: 0 },
        attempts: 0,
        lastError: "",
        updatedAt: { seconds: 3n, nanos: 0 },
        ...overrides,
    };
}

function stepUpHeader(call: { headers: HeadersInit | undefined } | undefined): string | null {
    return new Headers(call?.headers).get(AUTH_STEP_UP_HEADER_NAME);
}

describe("SocialVerificationService", () => {
    it("normalizes start inputs and passes mutation call options", async () => {
        const cases: StartVerificationCase[] = [
            {
                input: {
                    provider: "twitter",
                    handle: " @Alice_1 ",
                },
                expected: {
                    provider: Proto.SocialProvider.TWITTER,
                    handle: "Alice_1",
                    method: Proto.SocialVerificationMethod.METHOD_UNSPECIFIED,
                },
            },
            {
                input: {
                    provider: "discord",
                },
                expected: {
                    provider: Proto.SocialProvider.DISCORD,
                    method: Proto.SocialVerificationMethod.METHOD_UNSPECIFIED,
                },
            },
        ];

        for (const { input, expected } of cases) {
            const signal = new AbortController().signal;
            const transport = unaryTransportSequence([
                {
                    challengeCode: "poly_123",
                    expiresAt: { seconds: 2n, nanos: 0 },
                    verification: verification({
                        provider: expected.provider,
                        method: expected.method,
                        handle: expected.handle,
                    }),
                },
            ]);
            const service = new SocialVerificationService({ authApi: transport.transport });

            await expect(
                service.start(input, { signal, stepUpToken: " fresh-token " }),
            ).resolves.toMatchObject({
                challengeCode: "poly_123",
                expiresAt: { seconds: 2n, nanos: 0 },
                verification: {
                    provider: input.provider,
                    ...(input.provider === "twitter" ? { handle: expected.handle } : {}),
                },
            });

            expect(transport.calls[0]?.message).toMatchObject(expected);
            if (expected.handle === undefined) {
                expect(transport.calls[0]?.message).not.toHaveProperty("handle");
            }
            expect(transport.calls[0]?.message).not.toHaveProperty("stepUpToken");
            expect(transport.calls[0]?.signal).toBe(signal);
            expect(stepUpHeader(transport.calls[0])).toBe("fresh-token");
        }
    });

    it("normalizes provider-only methods and preserves empty verification responses", async () => {
        const signal = new AbortController().signal;
        const transport = unaryTransportSequence([
            {
                verification: verification({
                    status: Proto.SocialVerificationStatus.STATUS_QUEUED,
                }),
            },
            {},
        ]);
        const service = new SocialVerificationService({ authApi: transport.transport });

        await expect(
            service.markReady({ provider: "twitter" }, { stepUpToken: " ready-token " }),
        ).resolves.toMatchObject({
            verification: {
                provider: "twitter",
                status: "queued",
            },
        });
        await expect(service.get({ provider: "discord" }, { signal })).resolves.toEqual({
            verification: undefined,
        });

        expect(transport.calls[0]?.message).toEqual({ provider: Proto.SocialProvider.TWITTER });
        expect(stepUpHeader(transport.calls[0])).toBe("ready-token");
        expect(transport.calls[1]?.message).toEqual({ provider: Proto.SocialProvider.DISCORD });
        expect(transport.calls[1]?.signal).toBe(signal);
    });

    it("links Telegram: start returns the bot link, confirm sends step-up, unlink cancels", async () => {
        const awaiting = verification({
            provider: Proto.SocialProvider.TELEGRAM,
            method: Proto.SocialVerificationMethod.METHOD_DM,
            handle: "alice_tg",
            providerUserId: "7654321098",
            displayName: "Alice",
            status: Proto.SocialVerificationStatus.STATUS_AWAITING_CONFIRMATION,
        });
        const transport = unaryTransportSequence([
            {
                challengeCode: "poly_tg",
                expiresAt: { seconds: 2n, nanos: 0 },
                actionUrl: "https://t.me/polyester_bot?start=poly_tg",
                verification: awaiting,
            },
            { verification: awaiting },
            {
                verification: {
                    ...awaiting,
                    status: Proto.SocialVerificationStatus.STATUS_VERIFIED,
                },
            },
            {},
        ]);
        const service = new SocialVerificationService({ authApi: transport.transport });

        await expect(service.start({ provider: "telegram" })).resolves.toMatchObject({
            challengeCode: "poly_tg",
            actionUrl: "https://t.me/polyester_bot?start=poly_tg",
        });
        expect(transport.calls[0]?.message).toEqual({
            provider: Proto.SocialProvider.TELEGRAM,
            method: Proto.SocialVerificationMethod.METHOD_UNSPECIFIED,
        });

        await expect(service.get({ provider: "telegram" })).resolves.toMatchObject({
            verification: {
                provider: "telegram",
                method: "dm",
                status: "awaiting_confirmation",
                providerUserId: "7654321098",
                displayName: "Alice",
            },
        });

        await expect(
            service.confirm(
                { provider: "telegram", providerUserId: "7654321098" },
                { stepUpToken: "fresh" },
            ),
        ).resolves.toMatchObject({ verification: { status: "verified" } });
        expect(transport.calls[2]?.message).toEqual({
            provider: Proto.SocialProvider.TELEGRAM,
            providerUserId: "7654321098",
        });
        expect(stepUpHeader(transport.calls[2])).toBe("fresh");

        // Unlinking a provider never started returns no verification.
        await expect(service.unlink({ provider: "telegram" })).resolves.toEqual({
            verification: undefined,
        });
        expect(transport.calls[3]?.message).toEqual({ provider: Proto.SocialProvider.TELEGRAM });
    });

    it("rejects confirm and unlink for non-Telegram providers or malformed user IDs", async () => {
        const transport = unaryTransportSequence([]);
        const service = new SocialVerificationService({ authApi: transport.transport });
        for (const input of [
            { provider: "discord", providerUserId: "1" },
            { provider: "telegram", providerUserId: "" },
            { provider: "telegram", providerUserId: "-5" },
            { provider: "telegram", providerUserId: "12a" },
            { provider: "telegram", providerUserId: 7654321098 },
        ]) {
            await expect(service.confirm(input as never)).rejects.toThrow();
        }
        await expect(service.unlink({ provider: "twitter" } as never)).rejects.toThrow();
        expect(transport.calls).toHaveLength(0);
    });

    it("maps unknown backend verification enums to unspecified", async () => {
        const cases = [
            {
                field: "provider",
                value: 999 as Proto.SocialProvider,
            },
            {
                field: "method",
                value: 999 as Proto.SocialVerificationMethod,
            },
            {
                field: "status",
                value: 999 as Proto.SocialVerificationStatus,
            },
        ];

        for (const { field, value } of cases) {
            const transport = unaryTransportSequence([
                {
                    verification: verification({ [field]: value }),
                },
            ]);
            const service = new SocialVerificationService({ authApi: transport.transport });

            await expect(service.get({ provider: "twitter" })).resolves.toMatchObject({
                verification: { [field]: "unspecified" },
            });
        }
    });
});

describe("social verification schemas", () => {
    it("parses provider inputs and normalized start handles", () => {
        expect(v.parse(SocialProviderInputSchema, { provider: "discord" })).toEqual({
            provider: Proto.SocialProvider.DISCORD,
        });

        expect(
            v.parse(StartVerificationInputSchema, {
                provider: "twitter",
                handle: " @Alice_1 ",
            }),
        ).toEqual({
            provider: Proto.SocialProvider.TWITTER,
            handle: "Alice_1",
            method: Proto.SocialVerificationMethod.METHOD_UNSPECIFIED,
        });

        expect(v.parse(StartVerificationInputSchema, { provider: "discord" })).toEqual({
            provider: Proto.SocialProvider.DISCORD,
            method: Proto.SocialVerificationMethod.METHOD_UNSPECIFIED,
        });

        expect(
            v.parse(StartVerificationInputSchema, {
                provider: "discord",
                method: "channel",
            }),
        ).toEqual({
            provider: Proto.SocialProvider.DISCORD,
            method: Proto.SocialVerificationMethod.METHOD_CHANNEL,
        });
    });

    it("rejects handles that normalize to empty and preserves unspecified output enums", () => {
        for (const handle of ["", " @@@ "]) {
            expect(() =>
                v.parse(StartVerificationInputSchema, {
                    provider: "twitter",
                    handle,
                }),
            ).toThrow();
        }

        expect(
            transformVerification(
                verification({
                    status: Proto.SocialVerificationStatus.STATUS_UNSPECIFIED,
                }) as Proto.SocialVerification,
            ),
        ).toMatchObject({ status: "unspecified" });
    });

    it("labels a canceled verification with the canceled spelling", () => {
        expect(
            transformVerification(
                verification({
                    status: Proto.SocialVerificationStatus.STATUS_CANCELLED,
                }) as Proto.SocialVerification,
            ),
        ).toMatchObject({ status: "canceled" });
    });

    it("decodes typed verification failures and maps unset or unknown codes to unspecified", () => {
        const cases = [
            [AuthErrorCode.AUTH_SOCIAL_ACCOUNT_ALREADY_LINKED, "social_account_already_linked"],
            [AuthErrorCode.AUTH_UNSPECIFIED, "unspecified"],
            [999, "unspecified"],
            [undefined, "unspecified"],
        ] as const;

        for (const [errorCode, expected] of cases) {
            expect(
                transformVerification(
                    verification({
                        status: Proto.SocialVerificationStatus.STATUS_FAILED,
                        errorCode,
                    }) as Proto.SocialVerification,
                )?.errorCode,
            ).toBe(expected);
        }
    });

    it("rejects invalid handles and methods the provider does not support", () => {
        const cases = [
            { provider: "twitter" as const, handle: "sixteen_char_long" },
            { provider: "twitter" as const, handle: "not-valid" },
            { provider: "discord" as const, handle: "<script>" },
            { provider: "twitter" as const, handle: "alice", method: "channel" },
            { provider: "twitter" as const, handle: "alice", method: "dm" },
            { provider: "discord" as const, method: "profile" },
        ];

        for (const input of cases) {
            expect(() => v.parse(StartVerificationInputSchema, input)).toThrow();
        }
    });
});
