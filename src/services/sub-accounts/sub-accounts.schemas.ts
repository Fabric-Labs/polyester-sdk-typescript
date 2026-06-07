import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import * as v from "valibot";
import { formatId } from "../../utils/base58-id.js";
import { OptionalTimestampMsSchema, idInputSchema } from "../../shared/schemas.js";
import {
    SubAccountRoleCodec,
    InviteActionCodec,
    InviteStatusCodec,
    RawSubAccountStatusCodec,
} from "./sub-accounts.codecs.js";

const SUBACCOUNT_ROLE_VALUES = [
    "owner",
    "admin",
    "treasury",
    "leveraged_trader",
    "trader",
    "viewer",
] as const;

export const SubAccountRoleSchema = v.picklist(SUBACCOUNT_ROLE_VALUES);

export type SubAccountRole = v.InferOutput<typeof SubAccountRoleSchema>;

const ProtoSubAccountRoleSchema = v.pipe(
    v.enum(Proto.SubaccountRole),
    v.transform((role) => SubAccountRoleCodec.protoToOutput[role]),
);

export const CreateSubAccountInputSchema = v.object({
    label: v.optional(v.optional(v.string()), ""),
    smartAccountAddress: v.string(),
    nonce: v.string(),
    signature: v.string(),
    primaryWalletAddress: v.optional(v.optional(v.string()), ""),
    walletProvider: v.optional(v.optional(v.string()), ""),
});

export type CreateSubAccountInput = v.InferInput<typeof CreateSubAccountInputSchema>;

export const UpdateSubAccountInputSchema = v.pipe(
    v.object({
        ...v.pick(CreateSubAccountInputSchema, ["label"]).entries,
        subAccountId: idInputSchema("subaccountId"),
        status: v.picklist(["active", "frozen"]),
    }),
    v.transform(({ subAccountId, status, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
        status: status === "frozen" ? "disabled" : "active",
    })),
);

export type UpdateSubAccountInput = v.InferInput<typeof UpdateSubAccountInputSchema>;

export const InviteSubAccountMemberInputSchema = v.pipe(
    v.object({
        subAccountId: idInputSchema("subaccountId"),
        granteeAccountId: idInputSchema("granteeAccountId"),
        role: v.pipe(
            SubAccountRoleSchema,
            v.transform((role) => SubAccountRoleCodec.inputToProto[role]),
        ),
    }),
    v.transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    })),
);

export type InviteSubAccountMemberInput = v.InferInput<typeof InviteSubAccountMemberInputSchema>;

export const RemoveSubAccountMemberInputSchema = v.pipe(
    v.object({
        subAccountId: idInputSchema("subaccountId"),
        granteeAccountId: idInputSchema("granteeAccountId"),
    }),
    v.transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    })),
);

export type RemoveSubAccountMemberInput = v.InferInput<typeof RemoveSubAccountMemberInputSchema>;

export const UpdateSubAccountMemberRoleInputSchema = InviteSubAccountMemberInputSchema;

export type UpdateSubAccountMemberRoleInput = v.InferInput<
    typeof UpdateSubAccountMemberRoleInputSchema
>;

export const SetSubAccountMemberMfaRequirementInputSchema = v.pipe(
    v.object({
        subAccountId: idInputSchema("subaccountId"),
        requireMemberMfa: v.boolean(),
    }),
    v.transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    })),
);

export type SetSubAccountMemberMfaRequirementInput = v.InferInput<
    typeof SetSubAccountMemberMfaRequirementInputSchema
>;

export const ListSubAccountInvitesInputSchema = v.object({
    direction: v.optional(v.optional(v.picklist(["incoming", "outgoing", ""])), ""),
});

export type ListSubAccountInvitesInput = v.InferInput<typeof ListSubAccountInvitesInputSchema>;

const InviteActionSchema = v.picklist(["accept", "decline", "cancel"]);

const InviteStatusSchema = v.picklist(["pending", "accepted", "declined", "cancelled"]);

export type SubAccountInviteStatus = v.InferOutput<typeof InviteStatusSchema>;

const ProtoInviteStatusSchema = v.enum(Proto.SubaccountInviteStatus);

export const RespondSubAccountInviteInputSchema = v.object({
    inviteId: idInputSchema("inviteId"),
    action: v.pipe(
        InviteActionSchema,
        v.transform((v) => InviteActionCodec.inputToProto[v]),
    ),
});

export type RespondSubAccountInviteInput = v.InferInput<typeof RespondSubAccountInviteInputSchema>;

const RawSubAccountStatusSchema = v.picklist(["active", "disabled", "deleted"]);

export type RawSubAccountStatus = v.InferOutput<typeof RawSubAccountStatusSchema>;

export type SubAccountStatus = "active" | "frozen";

export const SubAccountSchema = v.object({
    id: v.pipe(
        v.bigint(),
        v.transform((v) => formatId(v)),
    ),
    role: ProtoSubAccountRoleSchema,
    label: v.optional(v.optional(v.string()), ""),
    status: v.pipe(
        RawSubAccountStatusSchema,
        v.transform((v) => RawSubAccountStatusCodec.rawToOutput[v]),
    ),
    smartAccountAddress: v.string(),
    ownerUsername: v.optional(v.optional(v.string()), ""),
    ownerAvatarUrl: v.optional(v.optional(v.string()), ""),
    ownerRootSmartAccountAddress: v.string(),
    subaccountPolicyId: v.pipe(
        v.bigint(),
        v.transform((v) => formatId(v)),
    ),
    requireMemberMfa: v.optional(v.boolean(), false),
});

export type SubAccount = v.InferOutput<typeof SubAccountSchema>;

export const SubAccountMemberSchema = v.object({
    accountId: v.pipe(
        v.bigint(),
        v.transform((v) => formatId(v)),
    ),
    role: ProtoSubAccountRoleSchema,
    username: v.optional(v.optional(v.string()), ""),
    smartAccountAddress: v.string(),
    avatarUrl: v.optional(v.optional(v.string()), ""),
    mfaEnrolled: v.optional(v.boolean(), false),
});

export type SubAccountMember = v.InferOutput<typeof SubAccountMemberSchema>;

export const SubAccountInviteSchema = v.pipe(
    v.object({
        id: v.pipe(
            v.bigint(),
            v.transform((v) => formatId(v)),
        ),
        subaccountId: v.pipe(
            v.bigint(),
            v.transform((v) => formatId(v)),
        ),
        granteeAccountId: v.pipe(
            v.bigint(),
            v.transform((v) => formatId(v)),
        ),
        inviterAccountId: v.pipe(
            v.bigint(),
            v.transform((v) => formatId(v)),
        ),
        role: ProtoSubAccountRoleSchema,
        status: v.pipe(
            ProtoInviteStatusSchema,
            v.transform((v) => InviteStatusCodec.protoToOutput[v]),
        ),
        createdAt: OptionalTimestampMsSchema,
        respondedAt: OptionalTimestampMsSchema,
        granteeUsername: v.optional(v.optional(v.string()), ""),
        inviterUsername: v.optional(v.optional(v.string()), ""),
        subaccountLabel: v.optional(v.optional(v.string()), ""),
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
            subAccountId: subaccountId,
            subAccountLabel: subaccountLabel,
            inviterSmartAccountAddress: inviterRootSmartAccountAddress,
            granteeSmartAccountAddress: granteeRootSmartAccountAddress,
        }),
    ),
);

export type SubAccountInvite = v.InferOutput<typeof SubAccountInviteSchema>;

export const SubAccountActivityInputSchema = v.pipe(
    v.object({
        subAccountId: idInputSchema("subaccountId"),
        limit: v.optional(v.optional(v.pipe(v.number(), v.maxValue(200))), 50),
        cursor: v.optional(v.string()),
    }),
    v.transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    })),
);

export type SubAccountActivityInput = v.InferInput<typeof SubAccountActivityInputSchema>;

export const SubAccountActivityEventSchema = v.object({
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
    actorAccountId: v.pipe(
        v.bigint(),
        v.transform((v) => formatId(v)),
    ),
    payloadJson: v.pipe(
        v.string(),
        v.transform((v) => JSON.parse(v)),
    ),
});

export type SubAccountEvent = v.InferOutput<typeof SubAccountActivityEventSchema>;
