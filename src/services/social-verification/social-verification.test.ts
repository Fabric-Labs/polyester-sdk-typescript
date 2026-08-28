import { describe, expect, it } from "vitest";
import * as v from "valibot";
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
        handle: string;
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
                    method: Proto.SocialVerificationMethod.METHOD_PROFILE,
                },
            },
            {
                input: {
                    provider: "discord",
                    handle: " fabric-labs ",
                    method: "dm",
                },
                expected: {
                    provider: Proto.SocialProvider.DISCORD,
                    handle: "fabric-labs",
                    method: Proto.SocialVerificationMethod.METHOD_DM,
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
                    handle: expected.handle,
                },
            });

            expect(transport.calls[0]?.message).toMatchObject(expected);
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

    it("rejects malformed backend verification enums", async () => {
        const cases = [
            {
                field: "provider",
                value: 999 as Proto.SocialProvider,
                message: "invalid provider 999",
            },
            {
                field: "method",
                value: 999 as Proto.SocialVerificationMethod,
                message: "invalid method 999",
            },
            {
                field: "status",
                value: 999 as Proto.SocialVerificationStatus,
                message: "invalid status 999",
            },
        ];

        for (const { field, value, message } of cases) {
            const transport = unaryTransportSequence([
                {
                    verification: verification({ [field]: value }),
                },
            ]);
            const service = new SocialVerificationService({ authApi: transport.transport });

            await expect(service.get({ provider: "twitter" })).rejects.toThrow(message);
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
            method: Proto.SocialVerificationMethod.METHOD_PROFILE,
        });

        const longHandle = `@${"a".repeat(64)}`;
        expect(
            v.parse(StartVerificationInputSchema, {
                provider: "discord",
                handle: longHandle,
            }),
        ).toMatchObject({
            handle: "a".repeat(64),
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

    it("rejects handles outside the backend contract", () => {
        const cases = [
            { provider: "twitter" as const, handle: "sixteen_char_long" },
            { provider: "twitter" as const, handle: "not-valid" },
            { provider: "discord" as const, handle: "<script>" },
        ];

        for (const input of cases) {
            expect(() => v.parse(StartVerificationInputSchema, input)).toThrow();
        }
    });
});
