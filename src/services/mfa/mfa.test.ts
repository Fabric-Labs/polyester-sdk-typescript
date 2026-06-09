import { describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/auth/v1/mfa_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { unaryTransportByMethod } from "../../testing/service-harness.js";
import { MfaService } from "./mfa.js";

const factor = {
    factorId: "mfa_1",
    factorType: Proto.MFAFactorType.MFA_FACTOR_TYPE_TOTP,
    label: "Authenticator",
    createdAt: { seconds: 1n, nanos: 500_000_000 },
};

const completeChallenge = {
    session: {
        sessionId: "session-1",
        sessionLevel: Proto.SessionLevel.MFA_ELEVATED,
        authenticationMethods: ["totp"],
        authTime: { seconds: 1n },
    },
    accessToken: " access-token ",
    accessTokenExpiresAt: { seconds: 2n },
    stepUpToken: " step-up-token ",
    stepUpExpiresAt: { seconds: 3n },
};

describe("MfaService", () => {
    it("passes step-up token as call metadata, not request input", async () => {
        const transport = unaryTransportByMethod({
            beginTOTPEnrollment: {
                enrollmentId: "enrollment-1",
                secret: "secret",
                otpauthUri: "otpauth://totp/polyester",
            },
        });
        const service = new MfaService(transport.transport);

        await expect(
            service.beginTotpEnrollment(
                { label: " authenticator " },
                { stepUpToken: " fresh-token " },
            ),
        ).resolves.toMatchObject({
            enrollmentId: "enrollment-1",
            secret: "secret",
            otpauthUri: "otpauth://totp/polyester",
        });

        const captured = transport.lastCall();
        expect(new Headers(captured?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        expect(captured?.message).toMatchObject({ label: "authenticator" });
        expect(captured?.message).not.toHaveProperty("stepUpToken");
    });

    const methodCases: {
        name: string;
        method: string;
        response: Record<string, unknown>;
        call: (
            service: MfaService,
            options?: { signal?: AbortSignal; stepUpToken?: string },
        ) => Promise<unknown>;
        expectedMessage: Record<string, unknown>;
        expectedResult?: Record<string, unknown>;
    }[] = [
        {
            name: "listFactors",
            method: "listMFAFactors",
            response: { factors: [factor], hasRecoveryCodes: true },
            call: (service, options) => service.listFactors(options),
            expectedMessage: {},
            expectedResult: {
                factors: [
                    {
                        factorId: "mfa_1",
                        factorType: "totp",
                        label: "Authenticator",
                        createdAtMs: 1_500,
                    },
                ],
                hasRecoveryCodes: true,
            },
        },
        {
            name: "finishTotpEnrollment",
            method: "finishTOTPEnrollment",
            response: { factor, recoveryCodes: ["recovery-1"] },
            call: (service, options) =>
                service.finishTotpEnrollment(
                    { enrollmentId: " enrollment-1 ", code: " 123456 " },
                    options,
                ),
            expectedMessage: { enrollmentId: "enrollment-1", code: "123456" },
            expectedResult: { recoveryCodes: ["recovery-1"] },
        },
        {
            name: "beginPasskeyEnrollment",
            method: "beginPasskeyEnrollment",
            response: {
                enrollmentId: "enrollment-2",
                publicKey: { challenge: "challenge" },
                expiresAt: { seconds: 4n },
            },
            call: (service, options) =>
                service.beginPasskeyEnrollment({ label: " passkey " }, options),
            expectedMessage: { label: "passkey" },
            expectedResult: {
                enrollmentId: "enrollment-2",
                publicKey: { challenge: "challenge" },
                expiresAt: 4_000,
            },
        },
        {
            name: "finishPasskeyEnrollment",
            method: "finishPasskeyEnrollment",
            response: { factor, recoveryCodes: [] },
            call: (service, options) =>
                service.finishPasskeyEnrollment(
                    { enrollmentId: " enrollment-2 ", credential: { id: "credential-1" } },
                    options,
                ),
            expectedMessage: {
                enrollmentId: "enrollment-2",
                credential: { id: "credential-1" },
            },
            expectedResult: { recoveryCodes: [] },
        },
        {
            name: "beginChallenge",
            method: "beginMFAChallenge",
            response: {
                challengeId: "challenge-1",
                allowedFactorTypes: [Proto.MFAFactorType.MFA_FACTOR_TYPE_TOTP],
                publicKey: { challenge: "passkey" },
                expiresAt: { seconds: 5n },
            },
            call: (service, options) => service.beginChallenge({ purpose: "freshStepUp" }, options),
            expectedMessage: {
                purpose: Proto.MFAChallengePurpose.MFA_CHALLENGE_PURPOSE_FRESH_STEP_UP,
            },
            expectedResult: {
                challengeId: "challenge-1",
                allowedFactorTypes: ["totp"],
                publicKey: { challenge: "passkey" },
                expiresAt: 5_000,
            },
        },
        {
            name: "verifyTotpChallenge",
            method: "verifyTOTPChallenge",
            response: completeChallenge,
            call: (service, options) =>
                service.verifyTotpChallenge(
                    { challengeId: " challenge-1 ", code: " 654321 " },
                    options,
                ),
            expectedMessage: { challengeId: "challenge-1", code: "654321" },
            expectedResult: {
                accessToken: "access-token",
                stepUpToken: "step-up-token",
                session: { sessionLevel: "mfaElevated" },
            },
        },
        {
            name: "finishPasskeyChallenge",
            method: "finishPasskeyChallenge",
            response: completeChallenge,
            call: (service, options) =>
                service.finishPasskeyChallenge(
                    { challengeId: " challenge-1 ", credential: { response: "signed" } },
                    options,
                ),
            expectedMessage: {
                challengeId: "challenge-1",
                credential: { response: "signed" },
            },
            expectedResult: {
                accessToken: "access-token",
                stepUpToken: "step-up-token",
            },
        },
        {
            name: "verifyRecoveryCodeChallenge",
            method: "verifyRecoveryCodeChallenge",
            response: completeChallenge,
            call: (service, options) =>
                service.verifyRecoveryCodeChallenge(
                    { challengeId: " challenge-1 ", recoveryCode: " recovery-code " },
                    options,
                ),
            expectedMessage: {
                challengeId: "challenge-1",
                recoveryCode: "recovery-code",
            },
            expectedResult: {
                accessToken: "access-token",
                stepUpToken: "step-up-token",
            },
        },
        {
            name: "deleteFactor",
            method: "deleteMFAFactor",
            response: {},
            call: (service, options) => service.deleteFactor({ factorId: " mfa_1 " }, options),
            expectedMessage: { factorId: "mfa_1" },
        },
        {
            name: "updateFactor",
            method: "updateMFAFactor",
            response: { factor: { ...factor, label: "Renamed" } },
            call: (service, options) =>
                service.updateFactor({ factorId: " mfa_1 ", label: "Renamed" }, options),
            expectedMessage: { factorId: "mfa_1", label: "Renamed" },
            expectedResult: { factor: { label: "Renamed", factorType: "totp" } },
        },
        {
            name: "regenerateRecoveryCodes",
            method: "regenerateRecoveryCodes",
            response: { recoveryCodes: ["new-1", "new-2"] },
            call: (service, options) => service.regenerateRecoveryCodes({}, options),
            expectedMessage: {},
            expectedResult: { recoveryCodes: ["new-1", "new-2"] },
        },
        {
            name: "claimFreshStepUp",
            method: "claimFreshStepUp",
            response: {
                stepUpId: "step-up-1",
                claimNonce: "nonce-1",
                claimExpiresAt: { seconds: 6n },
            },
            call: (service, options) =>
                service.claimFreshStepUp(
                    {
                        requestId: " request-1 ",
                        actionType: " order:create ",
                        subject: " BTC-USDT ",
                    },
                    options,
                ),
            expectedMessage: {
                requestId: "request-1",
                actionType: "order:create",
                subject: "BTC-USDT",
            },
            expectedResult: {
                stepUpId: "step-up-1",
                claimNonce: "nonce-1",
                claimExpiresAt: 6_000,
            },
        },
        {
            name: "consumeFreshStepUp",
            method: "consumeFreshStepUp",
            response: {},
            call: (service, options) =>
                service.consumeFreshStepUp(
                    {
                        stepUpId: " step-up-1 ",
                        requestId: " request-1 ",
                        actionType: " order:create ",
                        subject: " BTC-USDT ",
                        claimNonce: " nonce-1 ",
                    },
                    options,
                ),
            expectedMessage: {
                stepUpId: "step-up-1",
                requestId: "request-1",
                actionType: "order:create",
                subject: "BTC-USDT",
                claimNonce: "nonce-1",
            },
        },
        {
            name: "releaseFreshStepUp",
            method: "releaseFreshStepUp",
            response: {},
            call: (service, options) =>
                service.releaseFreshStepUp(
                    {
                        stepUpId: " step-up-1 ",
                        requestId: " request-1 ",
                        actionType: " order:create ",
                        subject: " BTC-USDT ",
                        claimNonce: " nonce-1 ",
                        reason: " failed ",
                    },
                    options,
                ),
            expectedMessage: {
                stepUpId: "step-up-1",
                requestId: "request-1",
                actionType: "order:create",
                subject: "BTC-USDT",
                claimNonce: "nonce-1",
                reason: "failed",
            },
        },
    ];

    for (const testCase of methodCases) {
        it(`normalizes ${testCase.name} calls and parses the response`, async () => {
            const controller = new AbortController();
            const transport = unaryTransportByMethod({ [testCase.method]: testCase.response });
            const service = new MfaService(transport.transport);

            const result = await testCase.call(service, { signal: controller.signal });

            const captured = transport.lastCall();
            expect(captured?.method.localName).toBe(testCase.method);
            expect(captured).toMatchObject({
                signal: controller.signal,
                message: testCase.expectedMessage,
            });
            if (testCase.expectedResult) {
                expect(result).toMatchObject(testCase.expectedResult);
            } else {
                expect(result).toBeUndefined();
            }
        });
    }

    it("rejects malformed backend challenge completion responses", async () => {
        const transport = unaryTransportByMethod({
            verifyTOTPChallenge: {
                ...completeChallenge,
                stepUpToken: undefined,
            },
        });
        const service = new MfaService(transport.transport);

        await expect(
            service.verifyTotpChallenge({ challengeId: "challenge-1", code: "123456" }),
        ).rejects.toThrow();
    });
});
