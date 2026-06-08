import type { Transport } from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/auth/v1/social_verification_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { SocialVerificationService } from "./social-verification.js";
import {
    SocialProviderInputSchema,
    StartVerificationInputSchema,
    transformVerification,
} from "./social-verification.schemas.js";

type CapturedCall = {
    message: Record<string, unknown>;
    signal: AbortSignal | undefined;
    headers: HeadersInit | undefined;
};

type StartVerificationCase = {
    input: Parameters<SocialVerificationService["start"]>[0];
    expected: {
        provider: Proto.SocialProvider;
        handle: string;
        method: Proto.SocialVerificationMethod;
    };
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

function stepUpHeader(call: CapturedCall | undefined): string | null {
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
            const calls: CapturedCall[] = [];
            const signal = new AbortController().signal;
            const service = new SocialVerificationService(
                transportWithMessages(
                    [
                        {
                            challengeCode: "poly_123",
                            expiresAt: { seconds: 2n, nanos: 0 },
                            verification: verification({
                                provider: expected.provider,
                                method: expected.method,
                                handle: expected.handle,
                            }),
                        },
                    ],
                    calls,
                ),
            );

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

            expect(calls[0]?.message).toMatchObject(expected);
            expect(calls[0]?.message).not.toHaveProperty("stepUpToken");
            expect(calls[0]?.signal).toBe(signal);
            expect(stepUpHeader(calls[0])).toBe("fresh-token");
        }
    });

    it("normalizes provider-only methods and preserves empty verification responses", async () => {
        const calls: CapturedCall[] = [];
        const signal = new AbortController().signal;
        const service = new SocialVerificationService(
            transportWithMessages(
                [
                    {
                        verification: verification({
                            status: Proto.SocialVerificationStatus.STATUS_QUEUED,
                        }),
                    },
                    {},
                ],
                calls,
            ),
        );

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

        expect(calls[0]?.message).toEqual({ provider: Proto.SocialProvider.TWITTER });
        expect(stepUpHeader(calls[0])).toBe("ready-token");
        expect(calls[1]?.message).toEqual({ provider: Proto.SocialProvider.DISCORD });
        expect(calls[1]?.signal).toBe(signal);
    });

    it("rejects malformed backend verification enums", async () => {
        const cases = [
            {
                field: "provider",
                value: Proto.SocialProvider.PROVIDER_UNSPECIFIED,
                message: "invalid provider 0",
            },
            {
                field: "method",
                value: Proto.SocialVerificationMethod.METHOD_UNSPECIFIED,
                message: "invalid method 0",
            },
            {
                field: "status",
                value: Proto.SocialVerificationStatus.STATUS_UNSPECIFIED,
                message: "invalid status 0",
            },
        ];

        for (const { field, value, message } of cases) {
            const service = new SocialVerificationService(
                transportWithMessages([
                    {
                        verification: verification({ [field]: value }),
                    },
                ]),
            );

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

    it("rejects handles that normalize to empty and unspecified output enums", () => {
        for (const handle of ["", " @@@ "]) {
            expect(() =>
                v.parse(StartVerificationInputSchema, {
                    provider: "twitter",
                    handle,
                }),
            ).toThrow();
        }

        expect(() =>
            transformVerification(
                verification({
                    status: Proto.SocialVerificationStatus.STATUS_UNSPECIFIED,
                }) as Proto.SocialVerification,
            ),
        ).toThrow("invalid status 0");
    });
});
