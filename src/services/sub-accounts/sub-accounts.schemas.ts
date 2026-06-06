import * as Proto from "../../gen/auth/v1/subaccounts_pb";
import { z } from "zod";
import { idToBigInt, formatId } from "../../utils/base58-id";
import { TimestampSchema } from "../../shared/schemas";
import { tsObjToMs } from "../../utils/time";
import {
	SubAccountRoleCodec,
	InviteActionCodec,
	InviteStatusCodec,
	RawSubAccountStatusCodec,
} from "./sub-accounts.codecs";

const SUBACCOUNT_ROLE_VALUES = [
	"owner",
	"admin",
	"treasury",
	"leveraged_trader",
	"trader",
	"viewer",
] as const;

export const SubAccountRoleSchema = z.enum(SUBACCOUNT_ROLE_VALUES);

export type SubAccountRole = z.output<typeof SubAccountRoleSchema>;

const ProtoSubAccountRoleSchema = z
	.enum(Proto.SubaccountRole)
	.transform((role) => SubAccountRoleCodec.protoToOutput[role]);

export const CreateSubAccountInputSchema = z.object({
	label: z.string().optional().default(""),
	smartAccountAddress: z.string(),
	nonce: z.string(),
	signature: z.string(),
	primaryWalletAddress: z.string().optional().default(""),
	walletProvider: z.string().optional().default(""),
});

export type CreateSubAccountInput = z.input<typeof CreateSubAccountInputSchema>;

export const UpdateSubAccountInputSchema = CreateSubAccountInputSchema.pick({
	label: true,
})
	.extend({
		subAccountId: z.string().transform((v) => idToBigInt(v, "subaccountId")),
		status: z.enum(["active", "frozen"]),
	})
	.transform(({ subAccountId, status, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
		status: status === "frozen" ? "disabled" : "active",
	}));

export type UpdateSubAccountInput = z.input<typeof UpdateSubAccountInputSchema>;

export const InviteSubAccountMemberInputSchema = z
	.object({
		subAccountId: z.string().transform((v) => idToBigInt(v, "subaccountId")),
		granteeAccountId: z.string().transform((v) => idToBigInt(v, "granteeAccountId")),
		role: SubAccountRoleSchema.transform((role) => SubAccountRoleCodec.inputToProto[role]),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type InviteSubAccountMemberInput = z.input<typeof InviteSubAccountMemberInputSchema>;

export const RemoveSubAccountMemberInputSchema = z
	.object({
		subAccountId: z.string().transform((v) => idToBigInt(v, "subaccountId")),
		granteeAccountId: z.string().transform((v) => idToBigInt(v, "granteeAccountId")),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type RemoveSubAccountMemberInput = z.input<typeof RemoveSubAccountMemberInputSchema>;

export const UpdateSubAccountMemberRoleInputSchema = InviteSubAccountMemberInputSchema;

export type UpdateSubAccountMemberRoleInput = z.input<typeof UpdateSubAccountMemberRoleInputSchema>;

export const SetSubAccountMemberMfaRequirementInputSchema = z
	.object({
		subAccountId: z.string().transform((v) => idToBigInt(v, "subaccountId")),
		requireMemberMfa: z.boolean(),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type SetSubAccountMemberMfaRequirementInput = z.input<
	typeof SetSubAccountMemberMfaRequirementInputSchema
>;

export const ListSubAccountInvitesInputSchema = z.object({
	direction: z.enum(["incoming", "outgoing", ""]).optional().default(""),
});

export type ListSubAccountInvitesInput = z.input<typeof ListSubAccountInvitesInputSchema>;

const InviteActionSchema = z.enum(["accept", "decline", "cancel"]);

const InviteStatusSchema = z.enum(["pending", "accepted", "declined", "cancelled"]);

export type SubAccountInviteStatus = z.output<typeof InviteStatusSchema>;

const ProtoInviteStatusSchema = z.enum(Proto.SubaccountInviteStatus);

export const RespondSubAccountInviteInputSchema = z.object({
	inviteId: z.string().transform((v) => idToBigInt(v, "inviteId")),
	action: InviteActionSchema.transform((v) => InviteActionCodec.inputToProto[v]),
});

export type RespondSubAccountInviteInput = z.input<typeof RespondSubAccountInviteInputSchema>;

const RawSubAccountStatusSchema = z.enum(["active", "disabled", "deleted"]);

export type RawSubAccountStatus = z.output<typeof RawSubAccountStatusSchema>;

export type SubAccountStatus = "active" | "frozen";

export const SubAccountSchema = z.object({
	id: z.bigint().transform((v) => formatId(v)),
	role: ProtoSubAccountRoleSchema,
	label: z.string().optional().default(""),
	status: RawSubAccountStatusSchema.transform((v) => RawSubAccountStatusCodec.rawToOutput[v]),
	smartAccountAddress: z.string(),
	ownerUsername: z.string().optional().default(""),
	ownerAvatarUrl: z.string().optional().default(""),
	ownerRootSmartAccountAddress: z.string(),
	subaccountPolicyId: z.bigint().transform((v) => formatId(v)),
	requireMemberMfa: z.boolean().default(false),
});

export type SubAccount = z.output<typeof SubAccountSchema>;

export const SubAccountMemberSchema = z.object({
	accountId: z.bigint().transform((v) => formatId(v)),
	role: ProtoSubAccountRoleSchema,
	username: z.string().optional().default(""),
	smartAccountAddress: z.string(),
	avatarUrl: z.string().optional().default(""),
	mfaEnrolled: z.boolean().default(false),
});

export type SubAccountMember = z.output<typeof SubAccountMemberSchema>;

export const SubAccountInviteSchema = z
	.object({
		id: z.bigint().transform((v) => formatId(v)),
		subaccountId: z.bigint().transform((v) => formatId(v)),
		granteeAccountId: z.bigint().transform((v) => formatId(v)),
		inviterAccountId: z.bigint().transform((v) => formatId(v)),
		role: ProtoSubAccountRoleSchema,
		status: ProtoInviteStatusSchema.transform((v) => InviteStatusCodec.protoToOutput[v]),
		createdAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
		respondedAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
		granteeUsername: z.string().optional().default(""),
		inviterUsername: z.string().optional().default(""),
		subaccountLabel: z.string().optional().default(""),
		inviterRootSmartAccountAddress: z.string(),
		granteeRootSmartAccountAddress: z.string(),
		requireMemberMfa: z.boolean(),
	})
	.transform(
		({
			subaccountLabel,
			subaccountId,
			inviterRootSmartAccountAddress,
			granteeRootSmartAccountAddress,
			...rest
		}) => ({
			...rest,
			subAccountId: subaccountId,
			subAccountLabel: subaccountLabel,
			inviterSmartAccountAddress: inviterRootSmartAccountAddress,
			granteeSmartAccountAddress: granteeRootSmartAccountAddress,
		})
	);

export type SubAccountInvite = z.output<typeof SubAccountInviteSchema>;

export const SubAccountActivityInputSchema = z
	.object({
		subAccountId: z.string().transform((v) => idToBigInt(v, "subaccountId")),
		limit: z.number().max(200).optional().default(50),
		cursor: z.string().optional(),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type SubAccountActivityInput = z.input<typeof SubAccountActivityInputSchema>;

export const SubAccountActivityEventSchema = z.object({
	cursor: z.string(),
	createdAt: TimestampSchema.optional().transform((v) => tsObjToMs(v)),
	entityKind: z.enum([
		"account",
		"session",
		"api_key",
		"subaccount",
		"member",
		"policy",
		"invite",
		"security",
	]),
	eventAction: z.enum([
		"created",
		"updated",
		"deleted",
		"enabled",
		"disabled",
		"removed",
		"role_set",
		"received",
		"replied",
		"failed",
		"revoked",
		"blocked",
		"hold_placed",
		"hold_released",
	]),
	source: z.enum(["web", "mobile", "api"]),
	ip: z.string().optional(),
	userAgent: z.string().optional(),
	actorAccountId: z.bigint().transform((v) => formatId(v)),
	payloadJson: z.string().transform((v) => JSON.parse(v)),
});

export type SubAccountEvent = z.output<typeof SubAccountActivityEventSchema>;
