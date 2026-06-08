import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import * as v from "valibot";
import { OptionalTimestampMsSchema, PublicIdSchema, idInputSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import {
    SubaccountRoleCodec,
    InviteActionCodec,
    InviteStatusCodec,
    SubaccountStatusCodec,
    SUBACCOUNT_STATUS_VALUES,
} from "./subaccounts.codecs.js";

const SUBACCOUNT_ROLE_VALUES = [
    "owner",
    "admin",
    "treasury",
    "leveraged_trader",
    "trader",
    "viewer",
] as const;

export const SubaccountRoleSchema = v.picklist(SUBACCOUNT_ROLE_VALUES);

export type SubaccountRole = v.InferOutput<typeof SubaccountRoleSchema>;

const ProtoSubaccountRoleSchema = v.pipe(
    v.enum(Proto.SubaccountRole),
    v.transform((role) =>
        requiredEnumLabel(SubaccountRoleCodec.protoToOutput, role, "SubaccountRoleSchema", "role"),
    ),
);

export const CreateSubaccountInputSchema = v.object({
    label: v.optional(v.string(), ""),
    smartAccountAddress: v.string(),
    nonce: v.string(),
    signature: v.string(),
    primaryWalletAddress: v.optional(v.string(), ""),
    walletProvider: v.optional(v.string(), ""),
});

export type CreateSubaccountInput = v.InferInput<typeof CreateSubaccountInputSchema>;

export const SubaccountIdInputSchema = v.object({
    subaccountId: idInputSchema("subaccountId"),
});

export type SubaccountIdInput = v.InferInput<typeof SubaccountIdInputSchema>;

export const CreateSubaccountResultSchema = v.object({
    subaccountId: PublicIdSchema,
    totalCreated: v.number(),
});

export type CreateSubaccountResult = v.InferOutput<typeof CreateSubaccountResultSchema>;

export const SubaccountMutationResultSchema = v.object({});

export type SubaccountMutationResult = v.InferOutput<typeof SubaccountMutationResultSchema>;

export const UpdateSubaccountInputSchema = v.pipe(
    v.object({
        ...v.pick(CreateSubaccountInputSchema, ["label"]).entries,
        subaccountId: idInputSchema("subaccountId"),
        status: v.picklist(SUBACCOUNT_STATUS_VALUES),
    }),
    v.transform(({ subaccountId, status, ...rest }) => ({
        ...rest,
        subaccountId,
        status: SubaccountStatusCodec.inputToProto[status],
    })),
);

export type UpdateSubaccountInput = v.InferInput<typeof UpdateSubaccountInputSchema>;

export const InviteSubaccountMemberInputSchema = v.object({
    subaccountId: idInputSchema("subaccountId"),
    granteeAccountId: idInputSchema("granteeAccountId"),
    role: v.pipe(
        SubaccountRoleSchema,
        v.transform((role) => SubaccountRoleCodec.inputToProto[role]),
    ),
});

export type InviteSubaccountMemberInput = v.InferInput<typeof InviteSubaccountMemberInputSchema>;

export const RemoveSubaccountMemberInputSchema = v.object({
    subaccountId: idInputSchema("subaccountId"),
    granteeAccountId: idInputSchema("granteeAccountId"),
});

export type RemoveSubaccountMemberInput = v.InferInput<typeof RemoveSubaccountMemberInputSchema>;

export const UpdateSubaccountMemberRoleInputSchema = InviteSubaccountMemberInputSchema;

export type UpdateSubaccountMemberRoleInput = v.InferInput<
    typeof UpdateSubaccountMemberRoleInputSchema
>;

export const SetSubaccountMemberMfaRequirementInputSchema = v.object({
    subaccountId: idInputSchema("subaccountId"),
    requireMemberMfa: v.boolean(),
});

export type SetSubaccountMemberMfaRequirementInput = v.InferInput<
    typeof SetSubaccountMemberMfaRequirementInputSchema
>;

export const ListSubaccountInvitesInputSchema = v.object({
    direction: v.optional(v.picklist(["incoming", "outgoing", ""]), ""),
});

export type ListSubaccountInvitesInput = v.InferInput<typeof ListSubaccountInvitesInputSchema>;

const InviteActionSchema = v.picklist(["accept", "decline", "cancel"]);

const InviteStatusSchema = v.picklist(["pending", "accepted", "declined", "cancelled"]);

export type SubaccountInviteStatus = v.InferOutput<typeof InviteStatusSchema>;

const ProtoInviteStatusSchema = v.enum(Proto.SubaccountInviteStatus);

export const RespondSubaccountInviteInputSchema = v.object({
    inviteId: idInputSchema("inviteId"),
    action: v.pipe(
        InviteActionSchema,
        v.transform((v) => InviteActionCodec.inputToProto[v]),
    ),
});

export type RespondSubaccountInviteInput = v.InferInput<typeof RespondSubaccountInviteInputSchema>;

const ProtoSubaccountStatusSchema = v.pipe(
    v.picklist(SUBACCOUNT_STATUS_VALUES),
    v.transform((status) => SubaccountStatusCodec.protoToOutput[status]),
);

export type SubaccountStatus = v.InferOutput<typeof ProtoSubaccountStatusSchema>;

export const SubaccountSchema = v.object({
    id: PublicIdSchema,
    role: ProtoSubaccountRoleSchema,
    label: v.optional(v.string(), ""),
    status: ProtoSubaccountStatusSchema,
    smartAccountAddress: v.string(),
    ownerUsername: v.optional(v.string(), ""),
    ownerAvatarUrl: v.optional(v.string(), ""),
    ownerRootSmartAccountAddress: v.string(),
    subaccountPolicyId: PublicIdSchema,
    requireMemberMfa: v.optional(v.boolean(), false),
});

export type Subaccount = v.InferOutput<typeof SubaccountSchema>;

export const SubaccountMemberSchema = v.object({
    accountId: PublicIdSchema,
    role: ProtoSubaccountRoleSchema,
    username: v.optional(v.string(), ""),
    smartAccountAddress: v.string(),
    avatarUrl: v.optional(v.string(), ""),
    mfaEnrolled: v.optional(v.boolean(), false),
});

export type SubaccountMember = v.InferOutput<typeof SubaccountMemberSchema>;

export const SubaccountInviteSchema = v.pipe(
    v.object({
        id: PublicIdSchema,
        subaccountId: PublicIdSchema,
        granteeAccountId: PublicIdSchema,
        inviterAccountId: PublicIdSchema,
        role: ProtoSubaccountRoleSchema,
        status: v.pipe(
            ProtoInviteStatusSchema,
            v.transform((v) =>
                requiredEnumLabel(
                    InviteStatusCodec.protoToOutput,
                    v,
                    "SubaccountInviteSchema",
                    "status",
                ),
            ),
        ),
        createdAt: OptionalTimestampMsSchema,
        respondedAt: OptionalTimestampMsSchema,
        granteeUsername: v.optional(v.string(), ""),
        inviterUsername: v.optional(v.string(), ""),
        subaccountLabel: v.optional(v.string(), ""),
        inviterRootSmartAccountAddress: v.string(),
        granteeRootSmartAccountAddress: v.string(),
        requireMemberMfa: v.boolean(),
    }),
    v.transform(
        ({
            subaccountLabel,
            subaccountId,
            inviterRootSmartAccountAddress,
            granteeRootSmartAccountAddress,
            ...rest
        }) => ({
            ...rest,
            subaccountId,
            subaccountLabel,
            inviterSmartAccountAddress: inviterRootSmartAccountAddress,
            granteeSmartAccountAddress: granteeRootSmartAccountAddress,
        }),
    ),
);

export type SubaccountInvite = v.InferOutput<typeof SubaccountInviteSchema>;

export const SubaccountActivityInputSchema = v.object({
    subaccountId: idInputSchema("subaccountId"),
    limit: v.optional(v.pipe(v.number(), v.maxValue(200)), 50),
    cursor: v.optional(v.string()),
});

export type SubaccountActivityInput = v.InferInput<typeof SubaccountActivityInputSchema>;

export const SubaccountActivityEventSchema = v.object({
    cursor: v.string(),
    createdAt: OptionalTimestampMsSchema,
    entityKind: v.picklist([
        "account",
        "session",
        "api_key",
        "subaccount",
        "member",
        "policy",
        "invite",
        "security",
    ]),
    eventAction: v.picklist([
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
    source: v.picklist(["web", "mobile", "api"]),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    actorAccountId: PublicIdSchema,
    payloadJson: v.pipe(
        v.string(),
        v.transform((v) => JSON.parse(v)),
    ),
});

export type SubaccountEvent = v.InferOutput<typeof SubaccountActivityEventSchema>;
