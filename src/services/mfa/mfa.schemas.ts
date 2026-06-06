import type { JsonObject } from "@bufbuild/protobuf";
import { z } from "zod";
import * as Proto from "../../gen/auth/v1/mfa_pb.js";
import { TimestampSchema } from "../../shared/schemas.js";
import { tsObjToMs } from "../../utils/time.js";
import {
	MfaChallengePurposeCodec,
	MfaFactorTypeCodec,
	MFA_CHALLENGE_PURPOSE_VALUES,
	SessionLevelCodec,
} from "./mfa.codecs.js";

function isJsonObject(val: unknown): val is JsonObject {
	return typeof val === "object" && val !== null && !Array.isArray(val);
}

export const JsonObjectSchema = z.custom<JsonObject>(isJsonObject);

export const MfaSessionInfoSchema = z
	.object({
		sessionId: z.string(),
		sessionLevel: z.nativeEnum(Proto.SessionLevel).transform((v) => {
			const label = SessionLevelCodec.protoToOutputWithDefault[v];
			if (!label) {
				throw new Error(
					"[PolyesterClient.MfaSessionInfoSchema]: sessionLevel is missing or unspecified"
				);
			}
			return label;
		}),
		authenticationMethods: z.array(z.string()).default([]),
		authTime: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
	})
	.transform(({ sessionId, sessionLevel, authenticationMethods, authTime }) => ({
		sessionId,
		sessionLevel,
		authenticationMethods,
		authTimeMs: authTime,
	}));

export type MfaSessionInfo = z.output<typeof MfaSessionInfoSchema>;

export const MfaFactorSchema = z
	.object({
		factorId: z.string(),
		factorType: z.nativeEnum(Proto.MFAFactorType).transform((v) => {
			const label = MfaFactorTypeCodec.protoToOutputWithDefault[v];
			if (!label) {
				throw new Error(
					"[PolyesterClient.MfaFactorSchema]: factorType is missing or unspecified"
				);
			}
			return label;
		}),
		label: z.string(),
		createdAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
		lastUsedAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
	})
	.transform(({ factorId, factorType, label, createdAt, lastUsedAt }) => ({
		factorId,
		factorType,
		label,
		createdAtMs: createdAt,
		lastUsedAtMs: lastUsedAt,
	}));

export type MfaFactor = z.output<typeof MfaFactorSchema>;

export const ListMfaFactorsResponseSchema = z.object({
	factors: z.array(MfaFactorSchema).default([]),
	hasRecoveryCodes: z.boolean().default(false),
});

export type ListMfaFactorsResult = z.output<typeof ListMfaFactorsResponseSchema>;

export const BeginTotpEnrollmentInputSchema = z.object({
	label: z.string().trim().min(1),
	stepUpToken: z.string().trim().optional(),
});

export type BeginTotpEnrollmentInput = z.input<typeof BeginTotpEnrollmentInputSchema>;

export const BeginTotpEnrollmentResultSchema = z.object({
	enrollmentId: z.string(),
	secret: z.string(),
	otpauthUri: z.string(),
	expiresAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
});

export type BeginTotpEnrollmentResult = z.output<typeof BeginTotpEnrollmentResultSchema>;

export const FinishTotpEnrollmentInputSchema = z.object({
	enrollmentId: z.string().trim().min(1),
	code: z.string().trim().min(1),
});

export type FinishTotpEnrollmentInput = z.input<typeof FinishTotpEnrollmentInputSchema>;

export const FinishTotpEnrollmentResultSchema = z.object({
	factor: MfaFactorSchema.optional(),
	recoveryCodes: z.array(z.string()).default([]),
});

export type FinishTotpEnrollmentResult = z.output<typeof FinishTotpEnrollmentResultSchema>;

export const BeginPasskeyEnrollmentInputSchema = z.object({
	label: z.string().trim().min(1),
	stepUpToken: z.string().trim().optional(),
});

export type BeginPasskeyEnrollmentInput = z.input<typeof BeginPasskeyEnrollmentInputSchema>;

export const BeginPasskeyEnrollmentResultSchema = z.object({
	enrollmentId: z.string(),
	publicKey: JsonObjectSchema.optional(),
	expiresAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
});

export type BeginPasskeyEnrollmentResult = z.output<typeof BeginPasskeyEnrollmentResultSchema>;

export const FinishPasskeyEnrollmentInputSchema = z.object({
	enrollmentId: z.string().trim().min(1),
	credential: JsonObjectSchema,
});

export type FinishPasskeyEnrollmentInput = z.input<typeof FinishPasskeyEnrollmentInputSchema>;

export const FinishPasskeyEnrollmentResultSchema = z.object({
	factor: MfaFactorSchema.optional(),
	recoveryCodes: z.array(z.string()).default([]),
});

export type FinishPasskeyEnrollmentResult = z.output<typeof FinishPasskeyEnrollmentResultSchema>;

export const BeginMfaChallengeInputSchema = z
	.object({
		purpose: z.enum(MFA_CHALLENGE_PURPOSE_VALUES),
	})
	.transform((data) => ({
		purpose: MfaChallengePurposeCodec.inputToProto[data.purpose],
	}));

export type BeginMfaChallengeInput = z.input<typeof BeginMfaChallengeInputSchema>;

export const BeginMfaChallengeResultSchema = z.object({
	challengeId: z.string(),
	allowedFactorTypes: z.array(z.nativeEnum(Proto.MFAFactorType)).transform((arr) =>
		arr.flatMap((t) => {
			const label = MfaFactorTypeCodec.protoToOutputWithDefault[t];
			return label ? [label] : [];
		})
	),
	publicKey: JsonObjectSchema.optional(),
	expiresAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
});

export type BeginMfaChallengeResult = z.output<typeof BeginMfaChallengeResultSchema>;

export const VerifyTotpChallengeInputSchema = z.object({
	challengeId: z.string().trim().min(1),
	code: z.string().trim().min(1),
});

export type VerifyTotpChallengeInput = z.input<typeof VerifyTotpChallengeInputSchema>;

export const FinishPasskeyChallengeInputSchema = z.object({
	challengeId: z.string().trim().min(1),
	credential: JsonObjectSchema,
});

export type FinishPasskeyChallengeInput = z.input<typeof FinishPasskeyChallengeInputSchema>;

export const VerifyRecoveryCodeChallengeInputSchema = z.object({
	challengeId: z.string().trim().min(1),
	recoveryCode: z.string().trim().min(1),
});

export type VerifyRecoveryCodeChallengeInput = z.input<
	typeof VerifyRecoveryCodeChallengeInputSchema
>;

export const CompleteMfaChallengeResultSchema = z
	.object({
		session: MfaSessionInfoSchema.optional(),
		accessToken: z.string(),
		accessTokenExpiresAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
		stepUpToken: z.string(),
		stepUpExpiresAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
	})
	.transform(({ session, accessToken, accessTokenExpiresAt, stepUpToken, stepUpExpiresAt }) => ({
		session,
		accessToken: accessToken.trim() || undefined,
		accessTokenExpiresAtMs: accessTokenExpiresAt,
		stepUpToken: stepUpToken.trim() || undefined,
		stepUpExpiresAtMs: stepUpExpiresAt,
	}));

export type CompleteMfaChallengeResult = z.output<typeof CompleteMfaChallengeResultSchema>;

export const DeleteMfaFactorInputSchema = z.object({
	factorId: z.string().trim().min(1),
	stepUpToken: z.string().trim().optional().nullable(),
});

export type DeleteMfaFactorInput = z.input<typeof DeleteMfaFactorInputSchema>;

export const UpdateMfaFactorInputSchema = z.object({
	factorId: z.string().trim().min(1),
	label: z.string().max(128),
	stepUpToken: z.string().trim().optional().nullable(),
});

export type UpdateMfaFactorInput = z.input<typeof UpdateMfaFactorInputSchema>;

export const UpdateMfaFactorResultSchema = z.object({
	factor: MfaFactorSchema.optional(),
});

export type UpdateMfaFactorResult = z.output<typeof UpdateMfaFactorResultSchema>;

export const RegenerateRecoveryCodesInputSchema = z.object({
	stepUpToken: z.string().trim().optional().nullable(),
});

export type RegenerateRecoveryCodesInput = z.input<typeof RegenerateRecoveryCodesInputSchema>;

export const RegenerateRecoveryCodesResultSchema = z.object({
	recoveryCodes: z.array(z.string()).default([]),
});

export type RegenerateRecoveryCodesResult = z.output<typeof RegenerateRecoveryCodesResultSchema>;

export const ClaimFreshStepUpInputSchema = z.object({
	requestId: z.string().trim().min(1),
	actionType: z.string().trim().min(1),
	subject: z.string().trim().min(1),
});

export type ClaimFreshStepUpInput = z.input<typeof ClaimFreshStepUpInputSchema>;

export const ClaimFreshStepUpResultSchema = z.object({
	stepUpId: z.string(),
	claimNonce: z.string(),
	claimExpiresAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
});

export type ClaimFreshStepUpResult = z.output<typeof ClaimFreshStepUpResultSchema>;

export const ConsumeFreshStepUpInputSchema = z.object({
	stepUpId: z.string().trim().min(1),
	requestId: z.string().trim().min(1),
	actionType: z.string().trim().min(1),
	subject: z.string().trim().min(1),
	claimNonce: z.string().trim().min(1),
});

export type ConsumeFreshStepUpInput = z.input<typeof ConsumeFreshStepUpInputSchema>;

export const ReleaseFreshStepUpInputSchema = z.object({
	stepUpId: z.string().trim().min(1),
	requestId: z.string().trim().min(1),
	actionType: z.string().trim().min(1),
	subject: z.string().trim().min(1),
	claimNonce: z.string().trim().min(1),
	reason: z.string().trim().min(1),
});

export type ReleaseFreshStepUpInput = z.input<typeof ReleaseFreshStepUpInputSchema>;
