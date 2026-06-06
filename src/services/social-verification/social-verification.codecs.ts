import * as Proto from "../../gen/auth/v1/social_verification_pb.js";

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
	} satisfies Record<SocialProviderValue, Proto.SocialProvider>,
	protoToOutput: {
		[Proto.SocialProvider.PROVIDER_UNSPECIFIED]: undefined,
		[Proto.SocialProvider.TWITTER]: "twitter",
		[Proto.SocialProvider.DISCORD]: "discord",
	} satisfies Record<Proto.SocialProvider, SocialProviderValue | undefined>,
} as const;

export const SocialVerificationMethodCodec = {
	inputToProto: {
		profile: Proto.SocialVerificationMethod.METHOD_PROFILE,
		channel: Proto.SocialVerificationMethod.METHOD_CHANNEL,
		dm: Proto.SocialVerificationMethod.METHOD_DM,
	} satisfies Record<SocialVerificationMethodValue, Proto.SocialVerificationMethod>,
	protoToOutput: {
		[Proto.SocialVerificationMethod.METHOD_UNSPECIFIED]: undefined,
		[Proto.SocialVerificationMethod.METHOD_PROFILE]: "profile",
		[Proto.SocialVerificationMethod.METHOD_CHANNEL]: "channel",
		[Proto.SocialVerificationMethod.METHOD_DM]: "dm",
	} satisfies Record<Proto.SocialVerificationMethod, SocialVerificationMethodValue | undefined>,
} as const;

export const SocialVerificationStatusCodec = {
	protoToOutput: {
		[Proto.SocialVerificationStatus.STATUS_UNSPECIFIED]: undefined,
		[Proto.SocialVerificationStatus.STATUS_PENDING_USER_ACTION]: "pending_user_action",
		[Proto.SocialVerificationStatus.STATUS_QUEUED]: "queued",
		[Proto.SocialVerificationStatus.STATUS_IN_PROGRESS]: "in_progress",
		[Proto.SocialVerificationStatus.STATUS_VERIFIED]: "verified",
		[Proto.SocialVerificationStatus.STATUS_FAILED]: "failed",
		[Proto.SocialVerificationStatus.STATUS_EXPIRED]: "expired",
		[Proto.SocialVerificationStatus.STATUS_CANCELLED]: "cancelled",
	} satisfies Record<Proto.SocialVerificationStatus, SocialVerificationStatusValue | undefined>,
} as const;
