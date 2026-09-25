import { AuthErrorCode } from "../../gen/auth/v1/auth_pb.js";
import * as Proto from "../../gen/auth/v1/social_verification_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const SOCIAL_PROVIDER_VALUES = ["twitter", "discord"] as const;
export type SocialProviderValue = (typeof SOCIAL_PROVIDER_VALUES)[number];

export const SOCIAL_VERIFICATION_METHOD_VALUES = ["profile", "channel", "dm"] as const;
export type SocialVerificationMethodValue = (typeof SOCIAL_VERIFICATION_METHOD_VALUES)[number];

export const SOCIAL_VERIFICATION_STATUS_VALUES = [
    "pending_user_action",
    "queued",
    "in_progress",
    "verified",
    "failed",
    "expired",
    "cancelled",
] as const;
export type SocialVerificationStatusValue = (typeof SOCIAL_VERIFICATION_STATUS_VALUES)[number];

export const SocialProviderCodec = {
    inputToProto: {
        twitter: Proto.SocialProvider.TWITTER,
        discord: Proto.SocialProvider.DISCORD,
    } satisfies InputToProto<SocialProviderValue, Proto.SocialProvider>,
    protoToOutput: {
        [Proto.SocialProvider.PROVIDER_UNSPECIFIED]: "unspecified",
        [Proto.SocialProvider.TWITTER]: "twitter",
        [Proto.SocialProvider.DISCORD]: "discord",
    } satisfies ProtoToOutput<Proto.SocialProvider, SocialProviderValue>,
} as const;

export const SocialVerificationMethodCodec = {
    inputToProto: {
        profile: Proto.SocialVerificationMethod.METHOD_PROFILE,
        channel: Proto.SocialVerificationMethod.METHOD_CHANNEL,
        dm: Proto.SocialVerificationMethod.METHOD_DM,
    } satisfies InputToProto<SocialVerificationMethodValue, Proto.SocialVerificationMethod>,
    protoToOutput: {
        [Proto.SocialVerificationMethod.METHOD_UNSPECIFIED]: "unspecified",
        [Proto.SocialVerificationMethod.METHOD_PROFILE]: "profile",
        [Proto.SocialVerificationMethod.METHOD_CHANNEL]: "channel",
        [Proto.SocialVerificationMethod.METHOD_DM]: "dm",
    } satisfies ProtoToOutput<Proto.SocialVerificationMethod, SocialVerificationMethodValue>,
} as const;

export const SocialVerificationStatusCodec = {
    protoToOutput: {
        [Proto.SocialVerificationStatus.STATUS_UNSPECIFIED]: "unspecified",
        [Proto.SocialVerificationStatus.STATUS_PENDING_USER_ACTION]: "pending_user_action",
        [Proto.SocialVerificationStatus.STATUS_QUEUED]: "queued",
        [Proto.SocialVerificationStatus.STATUS_IN_PROGRESS]: "in_progress",
        [Proto.SocialVerificationStatus.STATUS_VERIFIED]: "verified",
        [Proto.SocialVerificationStatus.STATUS_FAILED]: "failed",
        [Proto.SocialVerificationStatus.STATUS_EXPIRED]: "expired",
        [Proto.SocialVerificationStatus.STATUS_CANCELLED]: "cancelled",
    } satisfies ProtoToOutput<Proto.SocialVerificationStatus, SocialVerificationStatusValue>,
} as const;

export const SOCIAL_VERIFICATION_ERROR_CODE_VALUES = [
    "username_invalid",
    "username_taken",
    "username_cooldown",
    "username_feature_locked",
    "username_reserved",
    "invalid_request",
    "authentication_required",
    "session_kind_not_allowed",
    "wallet_login_failed",
    "resource_not_found",
    "subaccount_access_denied",
    "api_key_access_denied",
    "api_key_invalid_status_transition",
    "policy_invalid",
    "smart_account_already_linked",
    "invite_access_denied",
    "invite_invalid_state",
    "mfa_disabled",
    "mfa_not_enrolled",
    "mfa_session_invalid",
    "mfa_challenge_not_found",
    "mfa_challenge_invalid",
    "mfa_challenge_locked",
    "mfa_otp_invalid",
    "mfa_recovery_invalid",
    "mfa_passkey_not_available",
    "mfa_passkey_credential_invalid",
    "mfa_passkey_verify_failed",
    "mfa_enrollment_binding_invalid",
    "step_up_required",
    "step_up_proof_unavailable",
    "step_up_already_claimed",
    "policy_in_use",
    "policy_locked",
    "policy_scope_mismatch",
    "revision_conflict",
    "mfa_elevation_required",
    "mfa_last_factor_required",
    "internal_error",
    "terms_not_accepted",
    "social_verification_expired",
    "social_verification_invalid_state",
    "subaccount_challenge_invalid",
    "social_account_already_linked",
] as const;
export type SocialVerificationErrorCodeValue =
    (typeof SOCIAL_VERIFICATION_ERROR_CODE_VALUES)[number];

// Partial: auth codes added upstream decode to "unspecified" until mapped here.
export const SocialVerificationErrorCodeCodec = {
    protoToOutput: {
        [AuthErrorCode.AUTH_UNSPECIFIED]: "unspecified",
        [AuthErrorCode.AUTH_USERNAME_INVALID]: "username_invalid",
        [AuthErrorCode.AUTH_USERNAME_TAKEN]: "username_taken",
        [AuthErrorCode.AUTH_USERNAME_COOLDOWN]: "username_cooldown",
        [AuthErrorCode.AUTH_USERNAME_FEATURE_LOCKED]: "username_feature_locked",
        [AuthErrorCode.AUTH_USERNAME_RESERVED]: "username_reserved",
        [AuthErrorCode.AUTH_INVALID_REQUEST]: "invalid_request",
        [AuthErrorCode.AUTH_AUTHENTICATION_REQUIRED]: "authentication_required",
        [AuthErrorCode.AUTH_SESSION_KIND_NOT_ALLOWED]: "session_kind_not_allowed",
        [AuthErrorCode.AUTH_WALLET_LOGIN_FAILED]: "wallet_login_failed",
        [AuthErrorCode.AUTH_RESOURCE_NOT_FOUND]: "resource_not_found",
        [AuthErrorCode.AUTH_SUBACCOUNT_ACCESS_DENIED]: "subaccount_access_denied",
        [AuthErrorCode.AUTH_API_KEY_ACCESS_DENIED]: "api_key_access_denied",
        [AuthErrorCode.AUTH_API_KEY_INVALID_STATUS_TRANSITION]: "api_key_invalid_status_transition",
        [AuthErrorCode.AUTH_POLICY_INVALID]: "policy_invalid",
        [AuthErrorCode.AUTH_SMART_ACCOUNT_ALREADY_LINKED]: "smart_account_already_linked",
        [AuthErrorCode.AUTH_INVITE_ACCESS_DENIED]: "invite_access_denied",
        [AuthErrorCode.AUTH_INVITE_INVALID_STATE]: "invite_invalid_state",
        [AuthErrorCode.AUTH_MFA_DISABLED]: "mfa_disabled",
        [AuthErrorCode.AUTH_MFA_NOT_ENROLLED]: "mfa_not_enrolled",
        [AuthErrorCode.AUTH_MFA_SESSION_INVALID]: "mfa_session_invalid",
        [AuthErrorCode.AUTH_MFA_CHALLENGE_NOT_FOUND]: "mfa_challenge_not_found",
        [AuthErrorCode.AUTH_MFA_CHALLENGE_INVALID]: "mfa_challenge_invalid",
        [AuthErrorCode.AUTH_MFA_CHALLENGE_LOCKED]: "mfa_challenge_locked",
        [AuthErrorCode.AUTH_MFA_OTP_INVALID]: "mfa_otp_invalid",
        [AuthErrorCode.AUTH_MFA_RECOVERY_INVALID]: "mfa_recovery_invalid",
        [AuthErrorCode.AUTH_MFA_PASSKEY_NOT_AVAILABLE]: "mfa_passkey_not_available",
        [AuthErrorCode.AUTH_MFA_PASSKEY_CREDENTIAL_INVALID]: "mfa_passkey_credential_invalid",
        [AuthErrorCode.AUTH_MFA_PASSKEY_VERIFY_FAILED]: "mfa_passkey_verify_failed",
        [AuthErrorCode.AUTH_MFA_ENROLLMENT_BINDING_INVALID]: "mfa_enrollment_binding_invalid",
        [AuthErrorCode.AUTH_STEP_UP_REQUIRED]: "step_up_required",
        [AuthErrorCode.AUTH_STEP_UP_PROOF_UNAVAILABLE]: "step_up_proof_unavailable",
        [AuthErrorCode.AUTH_STEP_UP_ALREADY_CLAIMED]: "step_up_already_claimed",
        [AuthErrorCode.AUTH_POLICY_IN_USE]: "policy_in_use",
        [AuthErrorCode.AUTH_POLICY_LOCKED]: "policy_locked",
        [AuthErrorCode.AUTH_POLICY_SCOPE_MISMATCH]: "policy_scope_mismatch",
        [AuthErrorCode.AUTH_REVISION_CONFLICT]: "revision_conflict",
        [AuthErrorCode.AUTH_MFA_ELEVATION_REQUIRED]: "mfa_elevation_required",
        [AuthErrorCode.AUTH_MFA_LAST_FACTOR_REQUIRED]: "mfa_last_factor_required",
        [AuthErrorCode.AUTH_INTERNAL_ERROR]: "internal_error",
        [AuthErrorCode.AUTH_TERMS_NOT_ACCEPTED]: "terms_not_accepted",
        [AuthErrorCode.AUTH_SOCIAL_VERIFICATION_EXPIRED]: "social_verification_expired",
        [AuthErrorCode.AUTH_SOCIAL_VERIFICATION_INVALID_STATE]: "social_verification_invalid_state",
        [AuthErrorCode.AUTH_SUBACCOUNT_CHALLENGE_INVALID]: "subaccount_challenge_invalid",
        [AuthErrorCode.AUTH_SOCIAL_ACCOUNT_ALREADY_LINKED]: "social_account_already_linked",
    } satisfies Partial<ProtoToOutput<AuthErrorCode, SocialVerificationErrorCodeValue>>,
} as const;
