import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import * as ProtoPolicies from "../../gen/auth/v1/policies_pb.js";
import * as v from "valibot";
import {
    BigIntStringSchema,
    OptionalTimestampMsSchema,
    PublicIdSchema,
    TimestampSchema,
    idInputSchema,
    positiveBigintStringInputSchema,
} from "../../shared/schemas.js";
import { tsObjToMs, tsObjToNsString } from "../../utils/time.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import {
    SubaccountRoleCodec,
    SubaccountPermissionCodec,
    InviteActionCodec,
    InviteStatusCodec,
    SubaccountStatusCodec,
    SUBACCOUNT_STATUS_VALUES,
    ActivityEntityKindCodec,
    ActivityEventActionCodec,
    ActivityEventSourceCodec,
} from "./subaccounts.codecs.js";
import { PolicyActionCodec } from "../policies/shared.codecs.js";
import { buildProtoPatch, defineProtoPatchFields } from "../../utils/proto-patch.js";

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

const ProtoSubaccountPermissionSchema = v.pipe(
    v.enum(Proto.SubaccountPermission),
    v.transform((permission) =>
        requiredEnumLabel(
            SubaccountPermissionCodec.protoToOutput,
            permission,
            "SubaccountPermissionSchema",
            "permission",
        ),
    ),
);

export type SubaccountPermission = v.InferOutput<typeof ProtoSubaccountPermissionSchema>;

export const SubaccountPermissionDefinitionSchema = v.object({
    permission: ProtoSubaccountPermissionSchema,
    displayName: v.optional(v.string(), ""),
    description: v.optional(v.string(), ""),
    policyAction: v.pipe(
        v.enum(ProtoPolicies.PolicyAction),
        v.transform((action) =>
            requiredEnumLabel(
                PolicyActionCodec.protoToOutput,
                action,
                "SubaccountPermissionDefinitionSchema",
                "policy action",
            ),
        ),
    ),
});

export type SubaccountPermissionDefinition = v.InferOutput<
    typeof SubaccountPermissionDefinitionSchema
>;

export const SubaccountRoleDefinitionSchema = v.object({
    role: ProtoSubaccountRoleSchema,
    displayName: v.optional(v.string(), ""),
    description: v.optional(v.string(), ""),
    assignable: v.optional(v.boolean(), false),
    permissions: v.optional(v.array(ProtoSubaccountPermissionSchema), []),
});

export type SubaccountRoleDefinition = v.InferOutput<typeof SubaccountRoleDefinitionSchema>;

export const SubaccountRoleCatalogSchema = v.object({
    permissions: v.optional(v.array(SubaccountPermissionDefinitionSchema), []),
    roles: v.optional(v.array(SubaccountRoleDefinitionSchema), []),
});

export type SubaccountRoleCatalog = v.InferOutput<typeof SubaccountRoleCatalogSchema>;

export const EffectiveSubaccountPermissionsSchema = v.object({
    role: ProtoSubaccountRoleSchema,
    permissions: v.optional(v.array(ProtoSubaccountPermissionSchema), []),
    subaccountPolicyId: PublicIdSchema,
});

export type EffectiveSubaccountPermissions = v.InferOutput<
    typeof EffectiveSubaccountPermissionsSchema
>;

export const CreateSubaccountInputSchema = v.strictObject({
    label: v.optional(v.string(), ""),
    icon: v.optional(v.string(), ""),
    color: v.optional(v.string(), ""),
    smartAccountAddress: v.string(),
    nonce: v.string(),
    signature: v.string(),
    primaryWalletAddress: v.optional(v.string(), ""),
    walletProvider: v.optional(v.string(), ""),
});

export type CreateSubaccountInput = v.InferInput<typeof CreateSubaccountInputSchema>;

export const SubaccountIdInputSchema = v.strictObject({
    subaccountId: idInputSchema("subaccountId"),
});

export type SubaccountIdInput = v.InferInput<typeof SubaccountIdInputSchema>;

export const CreateSubaccountResultSchema = v.object({
    subaccountId: PublicIdSchema,
    totalCreated: v.number(),
    smartAccountSaltNonce: v.number(),
    revision: BigIntStringSchema,
});

export type CreateSubaccountResult = v.InferOutput<typeof CreateSubaccountResultSchema>;

export const SubaccountMutationResultSchema = v.object({});

export type SubaccountMutationResult = v.InferOutput<typeof SubaccountMutationResultSchema>;

type SubaccountPatch = {
    label?: string;
    icon?: string;
    color?: string;
    status?: (typeof SUBACCOUNT_STATUS_VALUES)[number];
};

const SUBACCOUNT_PATCH_FIELDS = defineProtoPatchFields<SubaccountPatch>()({
    label: { path: "label", encode: (label) => ({ label }) },
    icon: { path: "icon", encode: (icon) => ({ icon }) },
    color: { path: "color", encode: (color) => ({ color }) },
    status: {
        path: "status",
        encode: (status) => ({ status: SubaccountStatusCodec.inputToProto[status] }),
    },
});

export const UpdateSubaccountInputSchema = v.pipe(
    v.strictObject({
        subaccountId: idInputSchema("subaccountId"),
        expectedRevision: positiveBigintStringInputSchema("expectedRevision"),
        label: v.optional(v.string()),
        icon: v.optional(v.string()),
        color: v.optional(v.string()),
        status: v.optional(v.picklist(SUBACCOUNT_STATUS_VALUES)),
    }),
    v.check(
        ({ label, icon, color, status }) =>
            label !== undefined ||
            icon !== undefined ||
            color !== undefined ||
            status !== undefined,
        "At least one subaccount field must be provided",
    ),
    v.transform(({ subaccountId, expectedRevision, ...input }) => {
        const { patch: subaccount, updateMask } = buildProtoPatch(input, SUBACCOUNT_PATCH_FIELDS);
        return {
            subaccountId,
            subaccount,
            updateMask,
            expectedRevision,
        };
    }),
);

export type UpdateSubaccountInput = v.InferInput<typeof UpdateSubaccountInputSchema>;

export const DeleteSubaccountInputSchema = v.strictObject({
    subaccountId: idInputSchema("subaccountId"),
    expectedRevision: positiveBigintStringInputSchema("expectedRevision"),
});

export type DeleteSubaccountInput = v.InferInput<typeof DeleteSubaccountInputSchema>;

export const InviteSubaccountMemberInputSchema = v.strictObject({
    subaccountId: idInputSchema("subaccountId"),
    granteeAccountId: idInputSchema("granteeAccountId"),
    role: v.pipe(
        SubaccountRoleSchema,
        v.transform((role) => SubaccountRoleCodec.inputToProto[role]),
    ),
});

export type InviteSubaccountMemberInput = v.InferInput<typeof InviteSubaccountMemberInputSchema>;

export const RemoveSubaccountMemberInputSchema = v.strictObject({
    subaccountId: idInputSchema("subaccountId"),
    granteeAccountId: idInputSchema("granteeAccountId"),
});

export type RemoveSubaccountMemberInput = v.InferInput<typeof RemoveSubaccountMemberInputSchema>;

export const UpdateSubaccountMemberRoleInputSchema = InviteSubaccountMemberInputSchema;

export type UpdateSubaccountMemberRoleInput = v.InferInput<
    typeof UpdateSubaccountMemberRoleInputSchema
>;

export const SetSubaccountMemberMfaRequirementInputSchema = v.strictObject({
    subaccountId: idInputSchema("subaccountId"),
    requireMemberMfa: v.boolean(),
});

export type SetSubaccountMemberMfaRequirementInput = v.InferInput<
    typeof SetSubaccountMemberMfaRequirementInputSchema
>;

export const ListSubaccountInvitesInputSchema = v.strictObject({
    direction: v.optional(v.picklist(["incoming", "outgoing", ""]), ""),
});

export type ListSubaccountInvitesInput = v.InferInput<typeof ListSubaccountInvitesInputSchema>;

const InviteActionSchema = v.picklist(["accept", "decline", "cancel"]);

const InviteStatusSchema = v.picklist(["pending", "accepted", "declined", "cancelled"]);

export type SubaccountInviteStatus = v.InferOutput<typeof InviteStatusSchema>;

const ProtoInviteStatusSchema = v.enum(Proto.SubaccountInviteStatus);

export const RespondSubaccountInviteInputSchema = v.strictObject({
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

export const SubaccountSchema = v.pipe(
    v.object({
        id: PublicIdSchema,
        role: ProtoSubaccountRoleSchema,
        label: v.optional(v.string(), ""),
        icon: v.optional(v.string(), ""),
        color: v.optional(v.string(), ""),
        status: ProtoSubaccountStatusSchema,
        smartAccountAddress: v.string(),
        smartAccountSaltNonce: v.optional(v.number()),
        ownerUsername: v.optional(v.string(), ""),
        ownerAvatarUrl: v.optional(v.string(), ""),
        ownerRootSmartAccountAddress: v.string(),
        subaccountPolicyId: PublicIdSchema,
        requireMemberMfa: v.optional(v.boolean(), false),
        updatedAt: v.optional(TimestampSchema),
        revision: BigIntStringSchema,
    }),
    v.transform(({ updatedAt, ...subaccount }) => ({
        ...subaccount,
        updatedAt: tsObjToMs(updatedAt),
        updatedAtNs: tsObjToNsString(updatedAt),
    })),
);

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

export const SubaccountActivityInputSchema = v.strictObject({
    subaccountId: idInputSchema("subaccountId"),
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(200)), 50),
    pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
});

export type SubaccountActivityInput = v.InferInput<typeof SubaccountActivityInputSchema>;

export const SubaccountActivityEventSchema = v.object({
    createdAt: OptionalTimestampMsSchema,
    entityKind: v.pipe(
        v.enum(Proto.ActivityEntityKind),
        v.transform((value) =>
            requiredEnumLabel(
                ActivityEntityKindCodec.protoToOutput,
                value,
                "SubaccountActivityEventSchema",
                "entity kind",
            ),
        ),
    ),
    eventAction: v.pipe(
        v.enum(Proto.ActivityEventAction),
        v.transform((value) =>
            requiredEnumLabel(
                ActivityEventActionCodec.protoToOutput,
                value,
                "SubaccountActivityEventSchema",
                "event action",
            ),
        ),
    ),
    source: v.pipe(
        v.enum(Proto.ActivityEventSource),
        v.transform((value) =>
            requiredEnumLabel(
                ActivityEventSourceCodec.protoToOutput,
                value,
                "SubaccountActivityEventSchema",
                "source",
            ),
        ),
    ),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    actorAccountId: PublicIdSchema,
    payloadJson: v.pipe(
        v.string(),
        v.transform((v) => JSON.parse(v)),
    ),
});

export type SubaccountEvent = v.InferOutput<typeof SubaccountActivityEventSchema>;
