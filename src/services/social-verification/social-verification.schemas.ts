import * as v from "valibot";
import { TimestampSchema } from "../../shared/schemas.js";
import type * as Proto from "../../gen/auth/v1/social_verification_pb.js";
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

export const SocialProviderSchema = v.picklist(SOCIAL_PROVIDER_VALUES);
export type SocialProvider = v.InferInput<typeof SocialProviderSchema>;

export const SocialVerificationMethodSchema = v.picklist(SOCIAL_VERIFICATION_METHOD_VALUES);
export type SocialVerificationMethod = v.InferInput<typeof SocialVerificationMethodSchema>;

export const SocialVerificationStatusSchema = v.picklist(SOCIAL_VERIFICATION_STATUS_VALUES);
export type SocialVerificationStatus = v.InferOutput<typeof SocialVerificationStatusSchema>;

function normalizeHandle(input: string): string {
    return (input ?? "").trim().replace(/^@+/, "");
}

export function transformVerification(
    v: Proto.SocialVerification | undefined,
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

export const SocialVerificationSchema = v.object({
    id: v.bigint(),
    provider: SocialProviderSchema,
    method: SocialVerificationMethodSchema,
    handle: v.string(),
    providerUserId: v.string(),
    challengeCode: v.string(),
    status: SocialVerificationStatusSchema,
    requestedAt: v.optional(TimestampSchema),
    expiresAt: v.optional(TimestampSchema),
    verifiedAt: v.optional(TimestampSchema),
    attempts: v.number(),
    lastError: v.string(),
    updatedAt: v.optional(TimestampSchema),
});

export type SocialVerification = v.InferOutput<typeof SocialVerificationSchema>;

export const StartVerificationInputSchema = v.object({
    provider: v.pipe(
        SocialProviderSchema,
        v.transform((v) => SocialProviderCodec.inputToProto[v]),
    ),
    handle: v.pipe(v.string(), v.minLength(1), v.maxLength(64), v.transform(normalizeHandle)),
    method: v.pipe(
        v.optional(v.optional(SocialVerificationMethodSchema), "profile"),
        v.transform((v) => SocialVerificationMethodCodec.inputToProto[v ?? "profile"]),
    ),
});

export type StartVerificationInput = v.InferInput<typeof StartVerificationInputSchema>;

export const ProviderInputSchema = v.pipe(
    SocialProviderSchema,
    v.transform((v) => SocialProviderCodec.inputToProto[v]),
);

export const SocialProviderInputSchema = v.object({
    provider: ProviderInputSchema,
});

export type SocialProviderInput = v.InferInput<typeof SocialProviderInputSchema>;

export const StartVerificationResponseSchema = v.pipe(
    v.object({
        challengeCode: v.string(),
        expiresAt: v.optional(TimestampSchema),
        verification: v.optional(v.custom<Proto.SocialVerification>(() => true)),
    }),
    v.transform((res) => ({
        challengeCode: res.challengeCode,
        expiresAt: res.expiresAt,
        verification: transformVerification(res.verification),
    })),
);

export type StartVerificationResponse = v.InferOutput<typeof StartVerificationResponseSchema>;

export const VerificationReadyResponseSchema = v.pipe(
    v.object({
        verification: v.optional(v.custom<Proto.SocialVerification>(() => true)),
    }),
    v.transform((res) => ({
        verification: transformVerification(res.verification),
    })),
);

export type VerificationReadyResponse = v.InferOutput<typeof VerificationReadyResponseSchema>;

export const GetVerificationResponseSchema = v.pipe(
    v.object({
        verification: v.optional(v.custom<Proto.SocialVerification>(() => true)),
    }),
    v.transform((res) => ({
        verification: transformVerification(res.verification),
    })),
);

export type GetVerificationResponse = v.InferOutput<typeof GetVerificationResponseSchema>;
