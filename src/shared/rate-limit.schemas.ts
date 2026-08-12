import * as v from "./validation.js";
import * as Proto from "../gen/polyester/ratelimit/v1/types_pb.js";
import type { ProtoToOutput } from "../utils/types.js";
import { requiredEnumLabel } from "./proto-enum-codec.js";
import { OptionalBigIntStringSchema } from "./schemas.js";

const RATE_LIMIT_FAILURE_REASON_VALUES = [
    "unspecified",
    "quota_exceeded",
    "authority_unavailable",
] as const;

const RATE_LIMIT_POLICY_CLASS_VALUES = [
    "unspecified",
    "auth_public",
    "trading_place",
    "trading_cancel",
    "trading_read",
    "account_admin",
    "public_read",
    "account_security",
    "deposit_create",
    "internal_transfer",
    "withdraw_submit",
    "withdraw_validate",
    "guard_sign",
    "social_provider",
] as const;

const RATE_LIMIT_SCOPE_VALUES = [
    "unspecified",
    "client_ip",
    "api_key",
    "account",
    "subaccount",
    "connection",
    "service",
    "region",
    "symbol",
    "auth_subject",
] as const;

const RATE_LIMIT_REFILL_MODEL_VALUES = [
    "unspecified",
    "continuous",
    "fixed_window",
    "rolling_window",
] as const;

/** Machine-readable reason for a rate-limit rejection. */
export type RateLimitFailureReason = (typeof RATE_LIMIT_FAILURE_REASON_VALUES)[number];
/** Quota policy family used for a rate-limit decision. */
export type RateLimitPolicyClass = (typeof RATE_LIMIT_POLICY_CLASS_VALUES)[number];
/** Caller dimension that owns the exhausted capacity. */
export type RateLimitScope = (typeof RATE_LIMIT_SCOPE_VALUES)[number];
/** Refill behavior for the exhausted quota. */
export type RateLimitRefillModel = (typeof RATE_LIMIT_REFILL_MODEL_VALUES)[number];

const RateLimitFailureReasonCodec = {
    protoToOutput: {
        [Proto.FailureReason.REASON_UNSPECIFIED]: "unspecified",
        [Proto.FailureReason.QUOTA_EXCEEDED]: "quota_exceeded",
        [Proto.FailureReason.AUTHORITY_UNAVAILABLE]: "authority_unavailable",
    } satisfies ProtoToOutput<Proto.FailureReason, RateLimitFailureReason>,
} as const;

const RateLimitPolicyClassCodec = {
    protoToOutput: {
        [Proto.PolicyClass.CLASS_UNSPECIFIED]: "unspecified",
        [Proto.PolicyClass.AUTH_PUBLIC]: "auth_public",
        [Proto.PolicyClass.TRADING_PLACE]: "trading_place",
        [Proto.PolicyClass.TRADING_CANCEL]: "trading_cancel",
        [Proto.PolicyClass.TRADING_READ]: "trading_read",
        [Proto.PolicyClass.ACCOUNT_ADMIN]: "account_admin",
        [Proto.PolicyClass.PUBLIC_READ]: "public_read",
        [Proto.PolicyClass.ACCOUNT_SECURITY]: "account_security",
        [Proto.PolicyClass.DEPOSIT_CREATE]: "deposit_create",
        [Proto.PolicyClass.INTERNAL_TRANSFER]: "internal_transfer",
        [Proto.PolicyClass.WITHDRAW_SUBMIT]: "withdraw_submit",
        [Proto.PolicyClass.WITHDRAW_VALIDATE]: "withdraw_validate",
        [Proto.PolicyClass.GUARD_SIGN]: "guard_sign",
        [Proto.PolicyClass.SOCIAL_PROVIDER]: "social_provider",
    } satisfies ProtoToOutput<Proto.PolicyClass, RateLimitPolicyClass>,
} as const;

const RateLimitScopeCodec = {
    protoToOutput: {
        [Proto.LimiterScope.SCOPE_UNSPECIFIED]: "unspecified",
        [Proto.LimiterScope.CLIENT_IP]: "client_ip",
        [Proto.LimiterScope.API_KEY]: "api_key",
        [Proto.LimiterScope.ACCOUNT]: "account",
        [Proto.LimiterScope.SUBACCOUNT]: "subaccount",
        [Proto.LimiterScope.CONNECTION]: "connection",
        [Proto.LimiterScope.SERVICE]: "service",
        [Proto.LimiterScope.REGION]: "region",
        [Proto.LimiterScope.SYMBOL]: "symbol",
        [Proto.LimiterScope.AUTH_SUBJECT]: "auth_subject",
    } satisfies ProtoToOutput<Proto.LimiterScope, RateLimitScope>,
} as const;

const RateLimitRefillModelCodec = {
    protoToOutput: {
        [Proto.RefillModel.REFILL_UNSPECIFIED]: "unspecified",
        [Proto.RefillModel.CONTINUOUS]: "continuous",
        [Proto.RefillModel.FIXED_WINDOW]: "fixed_window",
        [Proto.RefillModel.ROLLING_WINDOW]: "rolling_window",
    } satisfies ProtoToOutput<Proto.RefillModel, RateLimitRefillModel>,
} as const;

/** Parses protobuf quota state into the stable SDK rate-limit detail shape. */
export const RateLimitDetailSchema = v.object({
    reason: v.pipe(
        v.enum(Proto.FailureReason),
        v.transform((reason) =>
            requiredEnumLabel(
                RateLimitFailureReasonCodec.protoToOutput,
                reason,
                "RateLimitDetailSchema",
                "reason",
            ),
        ),
    ),
    limit: OptionalBigIntStringSchema,
    remaining: OptionalBigIntStringSchema,
    retryAfterMs: OptionalBigIntStringSchema,
    policyVersion: OptionalBigIntStringSchema,
    operationId: v.string(),
    policyClass: v.pipe(
        v.enum(Proto.PolicyClass),
        v.transform((policyClass) =>
            requiredEnumLabel(
                RateLimitPolicyClassCodec.protoToOutput,
                policyClass,
                "RateLimitDetailSchema",
                "policyClass",
            ),
        ),
    ),
    scope: v.pipe(
        v.enum(Proto.LimiterScope),
        v.transform((scope) =>
            requiredEnumLabel(
                RateLimitScopeCodec.protoToOutput,
                scope,
                "RateLimitDetailSchema",
                "scope",
            ),
        ),
    ),
    refillModel: v.pipe(
        v.enum(Proto.RefillModel),
        v.transform((refillModel) =>
            requiredEnumLabel(
                RateLimitRefillModelCodec.protoToOutput,
                refillModel,
                "RateLimitDetailSchema",
                "refillModel",
            ),
        ),
    ),
});

/** Structured quota state exposed by order rejections and {@link RateLimitError}. */
export type RateLimitDetail = v.InferOutput<typeof RateLimitDetailSchema>;
