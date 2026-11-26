import {
    WalletAddressSchema,
    WalletChallengeMessageSchema,
    WalletChallengeUriSchema,
    WalletSignatureSchema,
} from "../auth/wallet-challenge.schemas.js";
import * as v from "valibot";
import {
    BigIntStringSchema,
    OptionalPublicIdSchema,
    OptionalTimestampMsSchema,
    PublicIdOrEmptySchema,
    PublicIdSchema,
    TimestampSchema,
    idInputSchema,
    positiveBigintStringInputSchema,
} from "../../shared/schemas.js";
import { create } from "@bufbuild/protobuf";
import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import { tsObjToMs, tsObjToNsString } from "../../utils/time.js";
import { formatId } from "../../utils/base58-id.js";
import { QUOTE_NOTIONAL_SCALE, scaledToDecimalOutput } from "../../shared/decimal-surface.js";
import { enumLabel, enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    SubaccountRoleCodec,
    SubaccountPermissionCodec,
    InviteActionCodec,
    InviteStatusCodec,
    SubaccountInviteDirectionCodec,
    SUBACCOUNT_INVITE_DIRECTION_VALUES,
    SubaccountStatusCodec,
    SUBACCOUNT_STATUS_VALUES,
    ActivityEntityKindCodec,
    ActivityEventActionCodec,
    ActivityEventSourceCodec,
    ActivityActorKindCodec,
    ActivityAllowlistActionCodec,
    ActivityApiKeyKindCodec,
    ActivityBrokerRoleCodec,
    ActivityElevatedActionCodec,
    ActivitySignInFailureCodec,
    ActivitySignInMethodCodec,
    ActivitySystemReasonCodec,
} from "./subaccounts.codecs.js";
import { PolicyActionCodec, policyActionLabelFor } from "../policies/shared.codecs.js";
import {
    ApiKeyPurposeCodec,
    ApiKeyStatusCodec,
    AssistantKeyPresetCodec,
} from "../api-keys/api-keys.codecs.js";
import { MfaChallengePurposeCodec, MfaFactorTypeCodec } from "../mfa/mfa.codecs.js";
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

const ProtoSubaccountRoleSchema = enumLabelSchema(SubaccountRoleCodec.protoToOutput);

const ProtoSubaccountPermissionSchema = enumLabelSchema(SubaccountPermissionCodec.protoToOutput);

export type SubaccountPermission = v.InferOutput<typeof ProtoSubaccountPermissionSchema>;

export const SubaccountPermissionDefinitionSchema = v.object({
    permission: ProtoSubaccountPermissionSchema,
    displayName: v.optional(v.string(), ""),
    description: v.optional(v.string(), ""),
    policyAction: enumLabelSchema(PolicyActionCodec.protoToOutput),
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
    subaccountPolicyId: PublicIdOrEmptySchema,
});

export type EffectiveSubaccountPermissions = v.InferOutput<
    typeof EffectiveSubaccountPermissionsSchema
>;

export const CreateSubaccountChallengeInputSchema = v.strictObject({
    ownerAddress: WalletAddressSchema,
    uri: WalletChallengeUriSchema,
});

export type CreateSubaccountChallengeInput = v.InferInput<
    typeof CreateSubaccountChallengeInputSchema
>;

export const SubaccountChallengeSchema = v.object({
    message: WalletChallengeMessageSchema,
    smartAccountAddress: WalletAddressSchema,
    smartAccountSaltNonce: v.number(),
    expiresAt: OptionalTimestampMsSchema,
    polyesterChainId: v.pipe(v.bigint(), v.transform(Number)),
});

export type SubaccountChallenge = v.InferOutput<typeof SubaccountChallengeSchema>;

export const CreateSubaccountInputSchema = v.strictObject({
    label: v.optional(v.string(), ""),
    icon: v.optional(v.string(), ""),
    color: v.optional(v.string(), ""),
    smartAccountAddress: WalletAddressSchema,
    message: WalletChallengeMessageSchema,
    signature: WalletSignatureSchema,
    /**
     * Makes the request safe to retry: 1 to 128 letters, digits, `.`, `_`, `:` or `-`, unique
     * within the root account and never reused. Resending the identical request under the same
     * key returns the sub-account it created with `replayed: true`. Sent exactly as given.
     */
    idempotencyKey: v.optional(v.string()),
});

export type CreateSubaccountInput = v.InferInput<typeof CreateSubaccountInputSchema>;

export const SubaccountIdInputSchema = v.strictObject({
    subaccountId: idInputSchema("subaccountId"),
});

export type SubaccountIdInput = v.InferInput<typeof SubaccountIdInputSchema>;

export const GetSubaccountInputSchema = v.strictObject({
    subaccountId: idInputSchema("subaccountId"),
    includeBalances: v.optional(v.boolean()),
});

export type GetSubaccountInput = v.InferInput<typeof GetSubaccountInputSchema>;

export const CreateSubaccountResultSchema = v.object({
    subaccountId: PublicIdSchema,
    totalCreated: v.number(),
    smartAccountSaltNonce: v.number(),
    revision: BigIntStringSchema,
    /**
     * `idempotencyKey` matched an earlier identical request: this describes the sub-account that
     * request created (at its current `revision`), and nothing new was created.
     */
    replayed: v.optional(v.boolean(), false),
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
    direction: v.pipe(
        v.optional(v.picklist(SUBACCOUNT_INVITE_DIRECTION_VALUES), ""),
        v.transform((direction) => SubaccountInviteDirectionCodec.inputToProto[direction]),
    ),
});

export type ListSubaccountInvitesInput = v.InferInput<typeof ListSubaccountInvitesInputSchema>;

const InviteActionSchema = v.picklist(["accept", "decline", "cancel"]);

const InviteStatusSchema = v.picklist(["pending", "accepted", "declined", "canceled"]);

export type SubaccountInviteStatus = v.InferOutput<typeof InviteStatusSchema>;

const ProtoInviteStatusSchema = v.number();

export const RespondSubaccountInviteInputSchema = v.strictObject({
    inviteId: idInputSchema("inviteId"),
    action: v.pipe(
        InviteActionSchema,
        v.transform((v) => InviteActionCodec.inputToProto[v]),
    ),
});

export type RespondSubaccountInviteInput = v.InferInput<typeof RespondSubaccountInviteInputSchema>;

const ProtoSubaccountStatusSchema = enumLabelSchema(SubaccountStatusCodec.protoToOutput);

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
        subaccountPolicyId: PublicIdOrEmptySchema,
        requireMemberMfa: v.optional(v.boolean(), false),
        updatedAt: v.optional(TimestampSchema),
        revision: BigIntStringSchema,
        /**
         * Only realtime updates set this: the caller lost access, so drop the subaccount from
         * local state. `role` is `"unspecified"` when it is true. Access and role changes leave
         * `revision` and `updatedAt` unchanged, so apply them in arrival order rather than
         * gating them on those fields.
         */
        removed: v.optional(v.boolean(), false),
        /**
         * The `idempotencyKey` of the `create` call that made this sub-account; `""` when none
         * was given, when the caller is not the owner on a signed-in session, and on realtime
         * updates.
         */
        idempotencyKey: v.optional(v.string(), ""),
        /**
         * True once a strategy bot has held this sub-account, and never cleared: keep it out of
         * funding-source choices, since a bot's funds never fund another bot
         * (`FUNDING_SOURCE_IS_BOT`). Its policy stays the bot's trading-only one, which can only be
         * cleared (`AUTH_STRATEGY_BOT_MANAGED`).
         */
        strategyBot: v.optional(v.boolean(), false),
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
            v.transform((v) => enumLabel(InviteStatusCodec.protoToOutput, v)),
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

/*
 * Activity events are formatted straight from the decoded protobuf messages. `item` and
 * `details` are `type`-tagged unions; a case this build does not know reads as
 * `{ type: "unspecified" }`. Opaque IDs are public base58 IDs, `undefined` when unset.
 */

const labelWith =
    <T>(mapping: Readonly<Partial<Record<number, T>>>) =>
    (value: number) =>
        enumLabel(mapping, value);
const optionalId = (id: bigint) => (id ? formatId(id) : undefined);

/** A value before and after the event; `undefined` when the event did not record it. */
function change<F, T>(c: { from: F; to: F } | undefined, map: (value: F) => T) {
    return c && { from: map(c.from), to: map(c.to) };
}
/** An empty string is unset. */
const textChange = (c: Proto.ActivityTextChange | undefined) => change(c, (s) => s);
const boolChange = (c: Proto.ActivityBoolChange | undefined) => change(c, (b) => b);
/** Epoch milliseconds; `undefined` is unset. */
const timeChange = (c: Proto.ActivityTimeChange | undefined) =>
    c && { from: tsObjToMs(c.from), to: tsObjToMs(c.to) };
/** `undefined` is none. */
const idChange = (c: Proto.ActivityIdChange | undefined) =>
    c && { fromId: optionalId(c.fromId), toId: optionalId(c.toId) };
const listChange = (c: Proto.ActivityListChange | undefined) =>
    c && { added: c.added, removed: c.removed };

function formatActivityActor(actor: Proto.ActivityActor = create(Proto.ActivityActorSchema)) {
    return {
        kind: enumLabel(ActivityActorKindCodec.protoToOutput, actor.kind),
        /**
         * Account that acted, for a user or an API key: a sub-account member's own account, or a
         * QuickSwap broker key's broker account. `undefined` for the system and an
         * unauthenticated request.
         */
        accountId: optionalId(actor.accountId),
        username: actor.username,
        /** API key the request was signed with, as `ApiKey.keyId` names it; `""` unless `kind` is `"api_key"`. */
        apiKeyId: actor.apiKeyId,
        apiKeyKind: enumLabel(ActivityApiKeyKindCodec.protoToOutput, actor.apiKeyKind),
        apiKeyLabel: actor.apiKeyLabel,
        /** Why Polyester acted; set for the `"system"` actor only. */
        systemReason: enumLabel(ActivitySystemReasonCodec.protoToOutput, actor.systemReason),
    };
}

const ACTIVITY_ITEM_TYPES = {
    accountId: "account",
    subaccountId: "subaccount",
    inviteId: "invite",
    subaccountPolicyId: "subaccount_policy",
    apiPolicyId: "api_policy",
    apiKeyId: "api_key",
    mfaFactorId: "mfa_factor",
    addressBookEntryId: "address_book_entry",
    brokerAllowlistChangeId: "broker_allowlist_change",
    connectedAppId: "connected_app",
} as const satisfies Record<NonNullable<Proto.ActivityItem["id"]["case"]>, string>;

function formatActivityItem(item: Proto.ActivityItem | undefined) {
    if (!item) return undefined;
    const { id, name } = item;
    // A sign-in session, a failed sign-in and the recovery codes have only a name.
    if (id.case === undefined) return { type: "unspecified" as const, id: undefined, name };
    return {
        type: ACTIVITY_ITEM_TYPES[id.case],
        /** Base58 public ID; `ApiKey.keyId` for an API key, `MFAFactor.factorId` for an MFA factor. */
        id: typeof id.value === "string" ? id.value : formatId(id.value),
        /** Display name when the event was recorded. */
        name,
    };
}

function formatActivityDetails(details: Proto.ActivityDetails | undefined) {
    if (!details) return undefined;
    const { kind } = details;
    switch (kind.case) {
        case "account":
            return {
                type: "account" as const,
                username: textChange(kind.value.username),
                /** Polyester generated the new username rather than the user choosing it. */
                generatedUsername: kind.value.generatedUsername,
            };
        case "session": {
            const d = kind.value;
            return {
                type: "session" as const,
                method: enumLabel(ActivitySignInMethodCodec.protoToOutput, d.method),
                /** Lowercase wallet address that signed in. */
                walletAddress: d.walletAddress,
                failure: enumLabel(ActivitySignInFailureCodec.protoToOutput, d.failure),
                /** Scopes granted to a connected app. */
                scopes: d.scopes,
                elevatedAction: enumLabel(
                    ActivityElevatedActionCodec.protoToOutput,
                    d.elevatedAction,
                ),
            };
        }
        case "apiKey": {
            const d = kind.value;
            return {
                type: "api_key" as const,
                label: textChange(d.label),
                status: change(d.status, labelWith(ApiKeyStatusCodec.protoToOutput)),
                purpose: change(d.purpose, labelWith(ApiKeyPurposeCodec.protoToOutput)),
                icon: textChange(d.icon),
                color: textChange(d.color),
                ipAllowlist: listChange(d.ipAllowlist),
                expiresAt: timeChange(d.expiresAt),
                apiPolicyId: idChange(d.apiPolicyId),
                /** Strategy bot the key belongs to, as `ApiKey.strategyBotId` is. */
                strategyBotId: optionalId(d.strategyBotId),
            };
        }
        case "policy": {
            const d = kind.value;
            return {
                type: "policy" as const,
                name: textChange(d.name),
                description: textChange(d.description),
                actions: d.actions && {
                    added: d.actions.added.map(policyActionLabelFor),
                    removed: d.actions.removed.map(policyActionLabelFor),
                },
                allSpotMarkets: boolChange(d.allSpotMarkets),
                /** Decimal USDT string; `"0"` is no cap. */
                maxOrderNotional: change(d.maxOrderNotional, (value) =>
                    scaledToDecimalOutput(value, QUOTE_NOTIONAL_SCALE),
                ),
                /** `0` is no cap. */
                maxOpenOrders: change(d.maxOpenOrders, Number),
                tradingHalted: boolChange(d.tradingHalted),
                locked: boolChange(d.locked),
                reviewAt: timeChange(d.reviewAt),
                expiresAt: timeChange(d.expiresAt),
                assistantPreset: enumLabel(
                    AssistantKeyPresetCodec.protoToOutput,
                    d.assistantPreset,
                ),
                /** Policy this one was copied from. */
                sourceTemplateId: optionalId(d.sourceTemplateId),
                /** Revision of that template when it was copied, as a decimal string. */
                sourceTemplateRevision: d.sourceTemplateRevision.toString(),
                /** Sub-account policy bound to the event's sub-account. */
                subaccountPolicyId: idChange(d.subaccountPolicyId),
                /** Strategy bot the policy was made for, as `ApiKey.strategyBotId` is. */
                strategyBotId: optionalId(d.strategyBotId),
            };
        }
        case "subaccount": {
            const d = kind.value;
            return {
                type: "subaccount" as const,
                label: textChange(d.label),
                status: change(d.status, labelWith(SubaccountStatusCodec.protoToOutput)),
                icon: textChange(d.icon),
                color: textChange(d.color),
                requireMemberMfa: boolChange(d.requireMemberMfa),
            };
        }
        case "member":
            return {
                type: "member" as const,
                /** `"unspecified"` when the member had or has no role. */
                role: change(kind.value.role, labelWith(SubaccountRoleCodec.protoToOutput)),
                brokerRole: change(
                    kind.value.brokerRole,
                    labelWith(ActivityBrokerRoleCodec.protoToOutput),
                ),
                /** The event moved a QuickSwap broker's ownership to the member. */
                ownershipTransfer: kind.value.ownershipTransfer,
            };
        case "invite": {
            const d = kind.value;
            return {
                type: "invite" as const,
                granteeAccountId: optionalId(d.granteeAccountId),
                role: enumLabel(SubaccountRoleCodec.protoToOutput, d.role),
                brokerRole: enumLabel(ActivityBrokerRoleCodec.protoToOutput, d.brokerRole),
                status: change(d.status, labelWith(InviteStatusCodec.protoToOutput)),
            };
        }
        case "destination": {
            const d = kind.value;
            return {
                type: "destination" as const,
                label: textChange(d.label),
                /** The entry's note changed; the note itself is not shown. */
                noteChanged: d.noteChanged,
                tagIds: d.tagIds && {
                    addedIds: d.tagIds.addedIds.map(formatId),
                    removedIds: d.tagIds.removedIds.map(formatId),
                },
            };
        }
        case "brokerAllowlist": {
            const d = kind.value;
            return {
                type: "broker_allowlist" as const,
                action: enumLabel(ActivityAllowlistActionCodec.protoToOutput, d.action),
                destination: d.destination,
                /** Decimal string. */
                destinationChainId: d.destinationChainId.toString(),
                label: d.label,
            };
        }
        case "security": {
            const d = kind.value;
            return {
                type: "security" as const,
                factorType: enumLabel(MfaFactorTypeCodec.protoToOutput, d.factorType),
                label: textChange(d.label),
                challengePurpose: enumLabel(
                    MfaChallengePurposeCodec.protoToOutput,
                    d.challengePurpose,
                ),
                recoveryCodesRotated: d.recoveryCodesRotated,
            };
        }
        default:
            return { type: "unspecified" as const };
    }
}

const protoMessage = <T>() => v.optional(v.custom<T>(() => true));

export const SubaccountActivityEventSchema = v.pipe(
    v.object({
        createdAt: OptionalTimestampMsSchema,
        entityKind: enumLabelSchema(ActivityEntityKindCodec.protoToOutput),
        eventAction: enumLabelSchema(ActivityEventActionCodec.protoToOutput),
        /** `"system"` for an event Polyester recorded by itself. */
        source: enumLabelSchema(ActivityEventSourceCodec.protoToOutput),
        /** Masked for non-owner and non-admin callers; empty for a system event. */
        ip: v.optional(v.string()),
        userAgent: v.optional(v.string()),
        /** Sub-account the event belongs to; undefined for an event of the main account itself. */
        subaccountId: OptionalPublicIdSchema,
        actor: protoMessage<Proto.ActivityActor>(),
        item: protoMessage<Proto.ActivityItem>(),
        details: protoMessage<Proto.ActivityDetails>(),
    }),
    v.transform(({ actor, item, details, ...event }) => ({
        ...event,
        /** Who performed the event. */
        actor: formatActivityActor(actor),
        /** Item the event affected; undefined only for an event recorded before items were. */
        item: formatActivityItem(item),
        /**
         * What the event changed, by the kind of item; undefined when it records no change
         * (such as a deletion) or was recorded before details were.
         */
        details: formatActivityDetails(details),
    })),
);

export type SubaccountEvent = v.InferOutput<typeof SubaccountActivityEventSchema>;

/** Who performed an activity event. */
export type ActivityActor = ReturnType<typeof formatActivityActor>;

/** The item an activity event affected, tagged by `type`. */
export type ActivityItem = NonNullable<ReturnType<typeof formatActivityItem>>;

/** What an activity event changed, tagged by the item's `type`. */
export type ActivityDetails = NonNullable<ReturnType<typeof formatActivityDetails>>;
