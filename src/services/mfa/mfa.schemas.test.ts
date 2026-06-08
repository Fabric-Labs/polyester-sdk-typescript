import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/auth/v1/mfa_pb.js";
import {
    BeginMfaChallengeInputSchema,
    BeginMfaChallengeResultSchema,
    CompleteMfaChallengeResultSchema,
    ConsumeFreshStepUpInputSchema,
    ListMfaFactorsResponseSchema,
    MfaFactorSchema,
    MfaSessionInfoSchema,
} from "./mfa.schemas.js";

describe("MFA schemas", () => {
    it("normalizes challenge and fresh step-up request fields", () => {
        const challenge = v.parse(BeginMfaChallengeInputSchema, {
            purpose: "freshStepUp",
        });
        const consume = v.parse(ConsumeFreshStepUpInputSchema, {
            stepUpId: " step-up-1 ",
            requestId: " request-1 ",
            actionType: " order:create ",
            subject: " BTC-USDT ",
            claimNonce: " nonce-1 ",
        });

        expect(challenge.purpose).toBe(
            Proto.MFAChallengePurpose.MFA_CHALLENGE_PURPOSE_FRESH_STEP_UP,
        );
        expect(consume).toEqual({
            stepUpId: "step-up-1",
            requestId: "request-1",
            actionType: "order:create",
            subject: "BTC-USDT",
            claimNonce: "nonce-1",
        });
    });

    it("defaults optional collections and trims optional tokens in responses", () => {
        const factors = v.parse(ListMfaFactorsResponseSchema, {});
        const complete = v.parse(CompleteMfaChallengeResultSchema, {
            accessToken: " ",
            stepUpToken: " ",
        });

        expect(factors).toEqual({ factors: [], hasRecoveryCodes: false });
        expect(complete).toMatchObject({
            accessToken: undefined,
            stepUpToken: undefined,
        });
    });

    it("converts timestamp responses to milliseconds", () => {
        const challenge = v.parse(BeginMfaChallengeResultSchema, {
            challengeId: "challenge-1",
            allowedFactorTypes: [Proto.MFAFactorType.MFA_FACTOR_TYPE_TOTP],
            expiresAt: { seconds: 1n, nanos: 250_000_000 },
        });
        const session = v.parse(MfaSessionInfoSchema, {
            sessionId: "session-1",
            sessionLevel: Proto.SessionLevel.FRESH_STEP_UP,
            authTime: { seconds: 2n, nanos: 500_000_000 },
        });

        expect(challenge).toMatchObject({
            allowedFactorTypes: ["totp"],
            expiresAt: 1_250,
        });
        expect(session).toMatchObject({
            sessionLevel: "freshStepUp",
            authenticationMethods: [],
            authTimeMs: 2_500,
        });
    });

    it("rejects unspecified backend enum values", () => {
        expect(() =>
            v.parse(MfaFactorSchema, {
                factorId: "mfa_1",
                factorType: Proto.MFAFactorType.MFA_FACTOR_TYPE_UNSPECIFIED,
                label: "Authenticator",
            }),
        ).toThrow();
        expect(() =>
            v.parse(BeginMfaChallengeResultSchema, {
                challengeId: "challenge-1",
                allowedFactorTypes: [Proto.MFAFactorType.MFA_FACTOR_TYPE_UNSPECIFIED],
            }),
        ).toThrow();
        expect(() =>
            v.parse(MfaSessionInfoSchema, {
                sessionId: "session-1",
                sessionLevel: Proto.SessionLevel.SESSION_LEVEL_UNSPECIFIED,
            }),
        ).toThrow();
    });
});
