import { z } from "zod";
import { TimestampSchema } from "../../shared/schemas.js";
import * as Proto from "../../gen/auth/v1/social_verification_pb.js";
import {
	SOCIAL_PROVIDER_VALUES,
	SOCIAL_VERIFICATION_METHOD_VALUES,
	SOCIAL_VERIFICATION_STATUS_VALUES,
	SocialProviderCodec,
	SocialVerificationMethodCodec,
	SocialVerificationStatusCodec,
} from "./social-verification.codecs.js";

export {
	SOCIAL_PROVIDER_VALUES,
	SOCIAL_VERIFICATION_METHOD_VALUES,
	SOCIAL_VERIFICATION_STATUS_VALUES,
} from "./social-verification.codecs.js";

export const SocialProviderSchema = z.enum(SOCIAL_PROVIDER_VALUES);
export type SocialProvider = z.input<typeof SocialProviderSchema>;

export const SocialVerificationMethodSchema = z.enum(SOCIAL_VERIFICATION_METHOD_VALUES);
export type SocialVerificationMethod = z.input<typeof SocialVerificationMethodSchema>;

export const SocialVerificationStatusSchema = z.enum(SOCIAL_VERIFICATION_STATUS_VALUES);
export type SocialVerificationStatus = z.output<typeof SocialVerificationStatusSchema>;

function normalizeHandle(input: string): string {
	return (input ?? "").trim().replace(/^@+/, "");
}

export function transformVerification(
	v: Proto.SocialVerification | undefined
): SocialVerification | undefined {
	if (!v) return undefined;
	return {
		id: v.id,
		provider: SocialProviderCodec.protoToOutput[v.provider] ?? "twitter",
		method: SocialVerificationMethodCodec.protoToOutput[v.method] ?? "profile",
		handle: v.handle,
		providerUserId: v.providerUserId,
		challengeCode: v.challengeCode,
		status: SocialVerificationStatusCodec.protoToOutput[v.status] ?? "pending_user_action",
		requestedAt: v.requestedAt,
		expiresAt: v.expiresAt,
		verifiedAt: v.verifiedAt,
		attempts: v.attempts,
		lastError: v.lastError,
		updatedAt: v.updatedAt,
	};
}

export const SocialVerificationSchema = z.object({
	id: z.bigint(),
	provider: SocialProviderSchema,
	method: SocialVerificationMethodSchema,
	handle: z.string(),
	providerUserId: z.string(),
	challengeCode: z.string(),
	status: SocialVerificationStatusSchema,
	requestedAt: TimestampSchema.optional(),
	expiresAt: TimestampSchema.optional(),
	verifiedAt: TimestampSchema.optional(),
	attempts: z.number(),
	lastError: z.string(),
	updatedAt: TimestampSchema.optional(),
});

export type SocialVerification = z.output<typeof SocialVerificationSchema>;

export const StartVerificationInputSchema = z.object({
	provider: SocialProviderSchema.transform((v) => SocialProviderCodec.inputToProto[v]),
	handle: z.string().min(1).max(64).transform(normalizeHandle),
	method: SocialVerificationMethodSchema.optional()
		.default("profile")
		.transform((v) => SocialVerificationMethodCodec.inputToProto[v]),
});

export type StartVerificationInput = z.input<typeof StartVerificationInputSchema>;

export const ProviderInputSchema = SocialProviderSchema.transform(
	(v) => SocialProviderCodec.inputToProto[v]
);

export const StartVerificationResponseSchema = z
	.object({
		challengeCode: z.string(),
		expiresAt: TimestampSchema.optional(),
		verification: z.custom<Proto.SocialVerification>().optional(),
	})
	.transform((res) => ({
		challengeCode: res.challengeCode,
		expiresAt: res.expiresAt,
		verification: transformVerification(res.verification),
	}));

export type StartVerificationResponse = z.output<typeof StartVerificationResponseSchema>;

export const VerificationReadyResponseSchema = z
	.object({
		verification: z.custom<Proto.SocialVerification>().optional(),
	})
	.transform((res) => ({
		verification: transformVerification(res.verification),
	}));

export type VerificationReadyResponse = z.output<typeof VerificationReadyResponseSchema>;

export const GetVerificationResponseSchema = z
	.object({
		verification: z.custom<Proto.SocialVerification>().optional(),
	})
	.transform((res) => ({
		verification: transformVerification(res.verification),
	}));

export type GetVerificationResponse = z.output<typeof GetVerificationResponseSchema>;
