import type { JsonObject } from "@bufbuild/protobuf";
import * as v from "valibot";
import * as Proto from "../../gen/auth/v1/mfa_pb.js";
import { OptionalTimestampMsSchema } from "../../shared/schemas.js";
import {
    MfaChallengePurposeCodec,
    MfaFactorTypeCodec,
    MFA_CHALLENGE_PURPOSE_VALUES,
    SessionLevelCodec,
} from "./mfa.codecs.js";

function isJsonObject(val: unknown): val is JsonObject {
    return typeof val === "object" && val !== null && !Array.isArray(val);
}

export const JsonObjectSchema = v.custom<JsonObject>(isJsonObject);

export const MfaSessionInfoSchema = v.pipe(
    v.object({
        sessionId: v.string(),
        sessionLevel: v.pipe(
            v.enum(Proto.SessionLevel),
            v.transform((v) => {
                const label = SessionLevelCodec.protoToOutputWithDefault[v];
                if (!label) {
                    throw new Error(
                        "[PolyesterClient.MfaSessionInfoSchema]: sessionLevel is missing or unspecified",
                    );
                }
                return label;
            }),
        ),
        authenticationMethods: v.optional(v.array(v.string()), []),
        authTime: OptionalTimestampMsSchema,
    }),
    v.transform(({ sessionId, sessionLevel, authenticationMethods, authTime }) => ({
        sessionId,
        sessionLevel,
        authenticationMethods,
        authTimeMs: authTime,
    })),
);

export type MfaSessionInfo = v.InferOutput<typeof MfaSessionInfoSchema>;

export const MfaFactorSchema = v.pipe(
    v.object({
        factorId: v.string(),
        factorType: v.pipe(
            v.enum(Proto.MFAFactorType),
            v.transform((v) => {
                const label = MfaFactorTypeCodec.protoToOutputWithDefault[v];
                if (!label) {
                    throw new Error(
                        "[PolyesterClient.MfaFactorSchema]: factorType is missing or unspecified",
                    );
                }
                return label;
            }),
        ),
        label: v.string(),
        createdAt: OptionalTimestampMsSchema,
        lastUsedAt: OptionalTimestampMsSchema,
    }),
    v.transform(({ factorId, factorType, label, createdAt, lastUsedAt }) => ({
        factorId,
        factorType,
        label,
        createdAtMs: createdAt,
        lastUsedAtMs: lastUsedAt,
    })),
);

export type MfaFactor = v.InferOutput<typeof MfaFactorSchema>;

export const ListMfaFactorsResponseSchema = v.object({
    factors: v.optional(v.array(MfaFactorSchema), []),
    hasRecoveryCodes: v.optional(v.boolean(), false),
});

export type ListMfaFactorsResult = v.InferOutput<typeof ListMfaFactorsResponseSchema>;

export const BeginTotpEnrollmentInputSchema = v.object({
    label: v.pipe(v.string(), v.trim(), v.minLength(1)),
    stepUpToken: v.optional(v.pipe(v.string(), v.trim())),
});

export type BeginTotpEnrollmentInput = v.InferInput<typeof BeginTotpEnrollmentInputSchema>;

export const BeginTotpEnrollmentResultSchema = v.object({
    enrollmentId: v.string(),
    secret: v.string(),
    otpauthUri: v.string(),
    expiresAt: OptionalTimestampMsSchema,
});

export type BeginTotpEnrollmentResult = v.InferOutput<typeof BeginTotpEnrollmentResultSchema>;

export const FinishTotpEnrollmentInputSchema = v.object({
    enrollmentId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    code: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type FinishTotpEnrollmentInput = v.InferInput<typeof FinishTotpEnrollmentInputSchema>;

export const FinishTotpEnrollmentResultSchema = v.object({
    factor: v.optional(MfaFactorSchema),
    recoveryCodes: v.optional(v.array(v.string()), []),
});

export type FinishTotpEnrollmentResult = v.InferOutput<typeof FinishTotpEnrollmentResultSchema>;

export const BeginPasskeyEnrollmentInputSchema = v.object({
    label: v.pipe(v.string(), v.trim(), v.minLength(1)),
    stepUpToken: v.optional(v.pipe(v.string(), v.trim())),
});

export type BeginPasskeyEnrollmentInput = v.InferInput<typeof BeginPasskeyEnrollmentInputSchema>;

export const BeginPasskeyEnrollmentResultSchema = v.object({
    enrollmentId: v.string(),
    publicKey: v.optional(JsonObjectSchema),
    expiresAt: OptionalTimestampMsSchema,
});

export type BeginPasskeyEnrollmentResult = v.InferOutput<typeof BeginPasskeyEnrollmentResultSchema>;

export const FinishPasskeyEnrollmentInputSchema = v.object({
    enrollmentId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    credential: JsonObjectSchema,
});

export type FinishPasskeyEnrollmentInput = v.InferInput<typeof FinishPasskeyEnrollmentInputSchema>;

export const FinishPasskeyEnrollmentResultSchema = v.object({
    factor: v.optional(MfaFactorSchema),
    recoveryCodes: v.optional(v.array(v.string()), []),
});

export type FinishPasskeyEnrollmentResult = v.InferOutput<
    typeof FinishPasskeyEnrollmentResultSchema
>;

export const BeginMfaChallengeInputSchema = v.pipe(
    v.object({
        purpose: v.picklist(MFA_CHALLENGE_PURPOSE_VALUES),
    }),
    v.transform((data) => ({
        purpose: MfaChallengePurposeCodec.inputToProto[data.purpose],
    })),
);

export type BeginMfaChallengeInput = v.InferInput<typeof BeginMfaChallengeInputSchema>;

export const BeginMfaChallengeResultSchema = v.object({
    challengeId: v.string(),
    allowedFactorTypes: v.pipe(
        v.array(v.enum(Proto.MFAFactorType)),
        v.transform((arr) =>
            arr.flatMap((t) => {
                const label = MfaFactorTypeCodec.protoToOutputWithDefault[t];
                return label ? [label] : [];
            }),
        ),
    ),
    publicKey: v.optional(JsonObjectSchema),
    expiresAt: OptionalTimestampMsSchema,
});

export type BeginMfaChallengeResult = v.InferOutput<typeof BeginMfaChallengeResultSchema>;

export const VerifyTotpChallengeInputSchema = v.object({
    challengeId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    code: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type VerifyTotpChallengeInput = v.InferInput<typeof VerifyTotpChallengeInputSchema>;

export const FinishPasskeyChallengeInputSchema = v.object({
    challengeId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    credential: JsonObjectSchema,
});

export type FinishPasskeyChallengeInput = v.InferInput<typeof FinishPasskeyChallengeInputSchema>;

export const VerifyRecoveryCodeChallengeInputSchema = v.object({
    challengeId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    recoveryCode: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type VerifyRecoveryCodeChallengeInput = v.InferInput<
    typeof VerifyRecoveryCodeChallengeInputSchema
>;

export const CompleteMfaChallengeResultSchema = v.pipe(
    v.object({
        session: v.optional(MfaSessionInfoSchema),
        accessToken: v.string(),
        accessTokenExpiresAt: OptionalTimestampMsSchema,
        stepUpToken: v.string(),
        stepUpExpiresAt: OptionalTimestampMsSchema,
    }),
    v.transform(({ session, accessToken, accessTokenExpiresAt, stepUpToken, stepUpExpiresAt }) => ({
        session,
        accessToken: accessToken.trim() || undefined,
        accessTokenExpiresAtMs: accessTokenExpiresAt,
        stepUpToken: stepUpToken.trim() || undefined,
        stepUpExpiresAtMs: stepUpExpiresAt,
    })),
);

export type CompleteMfaChallengeResult = v.InferOutput<typeof CompleteMfaChallengeResultSchema>;

export const DeleteMfaFactorInputSchema = v.object({
    factorId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    stepUpToken: v.nullable(v.optional(v.pipe(v.string(), v.trim()))),
});

export type DeleteMfaFactorInput = v.InferInput<typeof DeleteMfaFactorInputSchema>;

export const UpdateMfaFactorInputSchema = v.object({
    factorId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    label: v.pipe(v.string(), v.maxLength(128)),
    stepUpToken: v.nullable(v.optional(v.pipe(v.string(), v.trim()))),
});

export type UpdateMfaFactorInput = v.InferInput<typeof UpdateMfaFactorInputSchema>;

export const UpdateMfaFactorResultSchema = v.object({
    factor: v.optional(MfaFactorSchema),
});

export type UpdateMfaFactorResult = v.InferOutput<typeof UpdateMfaFactorResultSchema>;

export const RegenerateRecoveryCodesInputSchema = v.object({
    stepUpToken: v.optional(v.nullable(v.pipe(v.string(), v.trim()))),
});

export type RegenerateRecoveryCodesInput = v.InferInput<typeof RegenerateRecoveryCodesInputSchema>;

export const RegenerateRecoveryCodesResultSchema = v.object({
    recoveryCodes: v.optional(v.array(v.string()), []),
});

export type RegenerateRecoveryCodesResult = v.InferOutput<
    typeof RegenerateRecoveryCodesResultSchema
>;

export const ClaimFreshStepUpInputSchema = v.object({
    requestId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    actionType: v.pipe(v.string(), v.trim(), v.minLength(1)),
    subject: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type ClaimFreshStepUpInput = v.InferInput<typeof ClaimFreshStepUpInputSchema>;

export const ClaimFreshStepUpResultSchema = v.object({
    stepUpId: v.string(),
    claimNonce: v.string(),
    claimExpiresAt: OptionalTimestampMsSchema,
});

export type ClaimFreshStepUpResult = v.InferOutput<typeof ClaimFreshStepUpResultSchema>;

export const ConsumeFreshStepUpInputSchema = v.object({
    stepUpId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    requestId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    actionType: v.pipe(v.string(), v.trim(), v.minLength(1)),
    subject: v.pipe(v.string(), v.trim(), v.minLength(1)),
    claimNonce: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type ConsumeFreshStepUpInput = v.InferInput<typeof ConsumeFreshStepUpInputSchema>;

export const ReleaseFreshStepUpInputSchema = v.object({
    stepUpId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    requestId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    actionType: v.pipe(v.string(), v.trim(), v.minLength(1)),
    subject: v.pipe(v.string(), v.trim(), v.minLength(1)),
    claimNonce: v.pipe(v.string(), v.trim(), v.minLength(1)),
    reason: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type ReleaseFreshStepUpInput = v.InferInput<typeof ReleaseFreshStepUpInputSchema>;
