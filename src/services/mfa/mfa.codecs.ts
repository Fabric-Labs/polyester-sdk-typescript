import * as Proto from "../../gen/auth/v1/mfa_pb.js";
import type { ExcludeUnspecified } from "../../utils/types.js";

export const SESSION_LEVEL_VALUES = ["primaryAuthenticated", "mfaElevated", "freshStepUp"] as const;
export type SessionLevelLabel = (typeof SESSION_LEVEL_VALUES)[number];

export const SessionLevelCodec = {
	inputToProto: {
		primaryAuthenticated: Proto.SessionLevel.PRIMARY_AUTHENTICATED,
		mfaElevated: Proto.SessionLevel.MFA_ELEVATED,
		freshStepUp: Proto.SessionLevel.FRESH_STEP_UP,
	} satisfies Record<SessionLevelLabel, Proto.SessionLevel>,
	protoToOutput: {
		[Proto.SessionLevel.PRIMARY_AUTHENTICATED]: "primaryAuthenticated",
		[Proto.SessionLevel.MFA_ELEVATED]: "mfaElevated",
		[Proto.SessionLevel.FRESH_STEP_UP]: "freshStepUp",
	} satisfies Record<ExcludeUnspecified<Proto.SessionLevel>, SessionLevelLabel>,
	protoToOutputWithDefault: {
		[Proto.SessionLevel.SESSION_LEVEL_UNSPECIFIED]: undefined,
		[Proto.SessionLevel.PRIMARY_AUTHENTICATED]: "primaryAuthenticated",
		[Proto.SessionLevel.MFA_ELEVATED]: "mfaElevated",
		[Proto.SessionLevel.FRESH_STEP_UP]: "freshStepUp",
	} satisfies Record<Proto.SessionLevel, SessionLevelLabel | undefined>,
} as const;

export const MFA_FACTOR_TYPE_VALUES = ["totp", "passkey", "recoveryCode"] as const;
export type MfaFactorTypeLabel = (typeof MFA_FACTOR_TYPE_VALUES)[number];

export const MfaFactorTypeCodec = {
	inputToProto: {
		totp: Proto.MFAFactorType.MFA_FACTOR_TYPE_TOTP,
		passkey: Proto.MFAFactorType.MFA_FACTOR_TYPE_PASSKEY,
		recoveryCode: Proto.MFAFactorType.MFA_FACTOR_TYPE_RECOVERY_CODE,
	} satisfies Record<MfaFactorTypeLabel, Proto.MFAFactorType>,
	protoToOutput: {
		[Proto.MFAFactorType.MFA_FACTOR_TYPE_TOTP]: "totp",
		[Proto.MFAFactorType.MFA_FACTOR_TYPE_PASSKEY]: "passkey",
		[Proto.MFAFactorType.MFA_FACTOR_TYPE_RECOVERY_CODE]: "recoveryCode",
	} satisfies Record<ExcludeUnspecified<Proto.MFAFactorType>, MfaFactorTypeLabel>,
	protoToOutputWithDefault: {
		[Proto.MFAFactorType.MFA_FACTOR_TYPE_UNSPECIFIED]: undefined,
		[Proto.MFAFactorType.MFA_FACTOR_TYPE_TOTP]: "totp",
		[Proto.MFAFactorType.MFA_FACTOR_TYPE_PASSKEY]: "passkey",
		[Proto.MFAFactorType.MFA_FACTOR_TYPE_RECOVERY_CODE]: "recoveryCode",
	} satisfies Record<Proto.MFAFactorType, MfaFactorTypeLabel | undefined>,
} as const;

export const MFA_CHALLENGE_PURPOSE_VALUES = ["sessionElevation", "freshStepUp"] as const;
export type MfaChallengePurposeLabel = (typeof MFA_CHALLENGE_PURPOSE_VALUES)[number];

export const MfaChallengePurposeCodec = {
	inputToProto: {
		sessionElevation: Proto.MFAChallengePurpose.MFA_CHALLENGE_PURPOSE_SESSION_ELEVATION,
		freshStepUp: Proto.MFAChallengePurpose.MFA_CHALLENGE_PURPOSE_FRESH_STEP_UP,
	} satisfies Record<MfaChallengePurposeLabel, Proto.MFAChallengePurpose>,
	protoToOutput: {
		[Proto.MFAChallengePurpose.MFA_CHALLENGE_PURPOSE_SESSION_ELEVATION]: "sessionElevation",
		[Proto.MFAChallengePurpose.MFA_CHALLENGE_PURPOSE_FRESH_STEP_UP]: "freshStepUp",
	} satisfies Record<ExcludeUnspecified<Proto.MFAChallengePurpose>, MfaChallengePurposeLabel>,
	protoToOutputWithDefault: {
		[Proto.MFAChallengePurpose.MFA_CHALLENGE_PURPOSE_UNSPECIFIED]: undefined,
		[Proto.MFAChallengePurpose.MFA_CHALLENGE_PURPOSE_SESSION_ELEVATION]: "sessionElevation",
		[Proto.MFAChallengePurpose.MFA_CHALLENGE_PURPOSE_FRESH_STEP_UP]: "freshStepUp",
	} satisfies Record<Proto.MFAChallengePurpose, MfaChallengePurposeLabel | undefined>,
} as const;
