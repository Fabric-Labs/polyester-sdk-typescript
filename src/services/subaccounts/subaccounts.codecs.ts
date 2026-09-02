import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const SUBACCOUNT_ROLE_VALUES = [
    "owner",
    "admin",
    "treasury",
    "leveraged_trader",
    "trader",
    "viewer",
] as const;
export type SubaccountRoleValue = (typeof SUBACCOUNT_ROLE_VALUES)[number];

export const SUBACCOUNT_PERMISSION_VALUES = [
    "read_subaccount",
    "update_subaccount",
    "read_balances",
    "read_spot",
    "trade_spot",
    "read_internal_transfers",
    "internal_transfer",
    "external_withdraw",
    "read_address_book",
    "manage_address_book",
    "read_members",
    "manage_members",
    "read_invites",
    "manage_invites",
    "read_api_keys",
    "manage_api_keys",
    "read_subaccount_policy",
    "manage_subaccount_policy",
    "read_activity",
    "read_activity_security_details",
    "manage_member_mfa_requirement",
    "create_deposit_address",
    "read_deposit_addresses",
    "read_guard_signer_status",
    "manage_guard_signer",
] as const;
export type SubaccountPermissionValue = (typeof SUBACCOUNT_PERMISSION_VALUES)[number];

export const SUBACCOUNT_INVITE_ACTION_VALUES = ["accept", "decline", "cancel"] as const;
export type SubaccountInviteActionValue = (typeof SUBACCOUNT_INVITE_ACTION_VALUES)[number];

export const SUBACCOUNT_INVITE_STATUS_VALUES = [
    "pending",
    "accepted",
    "declined",
    "cancelled",
] as const;
export type SubaccountInviteStatusValue = (typeof SUBACCOUNT_INVITE_STATUS_VALUES)[number];

export const SUBACCOUNT_STATUS_VALUES = ["active", "disabled"] as const;
export type SubaccountStatusValue = (typeof SUBACCOUNT_STATUS_VALUES)[number];

export const ACTIVITY_ENTITY_KIND_VALUES = [
    "account",
    "session",
    "api_key",
    "subaccount",
    "member",
    "policy",
    "invite",
    "security",
    "destination",
] as const;
export type ActivityEntityKindValue = (typeof ACTIVITY_ENTITY_KIND_VALUES)[number];

export const ACTIVITY_EVENT_ACTION_VALUES = [
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
] as const;
export type ActivityEventActionValue = (typeof ACTIVITY_EVENT_ACTION_VALUES)[number];

export const ACTIVITY_EVENT_SOURCE_VALUES = ["web", "mobile", "api"] as const;
export type ActivityEventSourceValue = (typeof ACTIVITY_EVENT_SOURCE_VALUES)[number];
export const SubaccountRoleCodec = {
    inputToProto: {
        owner: Proto.SubaccountRole.OWNER,
        admin: Proto.SubaccountRole.ADMIN,
        treasury: Proto.SubaccountRole.TREASURY,
        leveraged_trader: Proto.SubaccountRole.LEVERAGED_TRADER,
        trader: Proto.SubaccountRole.TRADER,
        viewer: Proto.SubaccountRole.VIEWER,
    } satisfies InputToProto<SubaccountRoleValue, Proto.SubaccountRole>,
    protoToOutput: {
        [Proto.SubaccountRole.SUBACCOUNT_ROLE_UNSPECIFIED]: "unspecified",
        [Proto.SubaccountRole.OWNER]: "owner",
        [Proto.SubaccountRole.ADMIN]: "admin",
        [Proto.SubaccountRole.TREASURY]: "treasury",
        [Proto.SubaccountRole.LEVERAGED_TRADER]: "leveraged_trader",
        [Proto.SubaccountRole.TRADER]: "trader",
        [Proto.SubaccountRole.VIEWER]: "viewer",
    } satisfies ProtoToOutput<Proto.SubaccountRole, SubaccountRoleValue>,
} as const;

export const SubaccountPermissionCodec = {
    protoToOutput: {
        [Proto.SubaccountPermission.UNSPECIFIED]: "unspecified",
        [Proto.SubaccountPermission.READ_SUBACCOUNT]: "read_subaccount",
        [Proto.SubaccountPermission.UPDATE_SUBACCOUNT]: "update_subaccount",
        [Proto.SubaccountPermission.READ_BALANCES]: "read_balances",
        [Proto.SubaccountPermission.READ_SPOT]: "read_spot",
        [Proto.SubaccountPermission.TRADE_SPOT]: "trade_spot",
        [Proto.SubaccountPermission.READ_INTERNAL_TRANSFERS]: "read_internal_transfers",
        [Proto.SubaccountPermission.INTERNAL_TRANSFER]: "internal_transfer",
        [Proto.SubaccountPermission.EXTERNAL_WITHDRAW]: "external_withdraw",
        [Proto.SubaccountPermission.READ_ADDRESS_BOOK]: "read_address_book",
        [Proto.SubaccountPermission.MANAGE_ADDRESS_BOOK]: "manage_address_book",
        [Proto.SubaccountPermission.READ_MEMBERS]: "read_members",
        [Proto.SubaccountPermission.MANAGE_MEMBERS]: "manage_members",
        [Proto.SubaccountPermission.READ_INVITES]: "read_invites",
        [Proto.SubaccountPermission.MANAGE_INVITES]: "manage_invites",
        [Proto.SubaccountPermission.READ_API_KEYS]: "read_api_keys",
        [Proto.SubaccountPermission.MANAGE_API_KEYS]: "manage_api_keys",
        [Proto.SubaccountPermission.READ_SUBACCOUNT_POLICY]: "read_subaccount_policy",
        [Proto.SubaccountPermission.MANAGE_SUBACCOUNT_POLICY]: "manage_subaccount_policy",
        [Proto.SubaccountPermission.READ_ACTIVITY]: "read_activity",
        [Proto.SubaccountPermission.READ_ACTIVITY_SECURITY_DETAILS]:
            "read_activity_security_details",
        [Proto.SubaccountPermission.MANAGE_MEMBER_MFA_REQUIREMENT]: "manage_member_mfa_requirement",
        [Proto.SubaccountPermission.CREATE_DEPOSIT_ADDRESS]: "create_deposit_address",
        [Proto.SubaccountPermission.READ_DEPOSIT_ADDRESSES]: "read_deposit_addresses",
        [Proto.SubaccountPermission.READ_GUARD_SIGNER_STATUS]: "read_guard_signer_status",
        [Proto.SubaccountPermission.MANAGE_GUARD_SIGNER]: "manage_guard_signer",
    } satisfies ProtoToOutput<Proto.SubaccountPermission, SubaccountPermissionValue>,
} as const;

export const InviteActionCodec = {
    inputToProto: {
        accept: Proto.SubaccountInviteAction.ACCEPT,
        decline: Proto.SubaccountInviteAction.DECLINE,
        cancel: Proto.SubaccountInviteAction.CANCEL,
    } satisfies InputToProto<SubaccountInviteActionValue, Proto.SubaccountInviteAction>,
} as const;

export const InviteStatusCodec = {
    protoToOutput: {
        [Proto.SubaccountInviteStatus.UNSPECIFIED]: "unspecified",
        [Proto.SubaccountInviteStatus.PENDING]: "pending",
        [Proto.SubaccountInviteStatus.ACCEPTED]: "accepted",
        [Proto.SubaccountInviteStatus.DECLINED]: "declined",
        [Proto.SubaccountInviteStatus.CANCELLED]: "cancelled",
    } satisfies ProtoToOutput<Proto.SubaccountInviteStatus, SubaccountInviteStatusValue>,
} as const;

export const SubaccountStatusCodec = {
    inputToProto: {
        active: Proto.SubaccountStatus.ACTIVE,
        disabled: Proto.SubaccountStatus.DISABLED,
    } satisfies InputToProto<SubaccountStatusValue, Proto.SubaccountStatus>,
    protoToOutput: {
        [Proto.SubaccountStatus.UNSPECIFIED]: "unspecified",
        [Proto.SubaccountStatus.ACTIVE]: "active",
        [Proto.SubaccountStatus.DISABLED]: "disabled",
    } satisfies ProtoToOutput<Proto.SubaccountStatus, SubaccountStatusValue>,
} as const;

export const ActivityEntityKindCodec = {
    protoToOutput: {
        [Proto.ActivityEntityKind.ACTIVITY_ENTITY_UNSPECIFIED]: "unspecified",
        [Proto.ActivityEntityKind.ACTIVITY_ENTITY_ACCOUNT]: "account",
        [Proto.ActivityEntityKind.ACTIVITY_ENTITY_SESSION]: "session",
        [Proto.ActivityEntityKind.ACTIVITY_ENTITY_API_KEY]: "api_key",
        [Proto.ActivityEntityKind.ACTIVITY_ENTITY_SUBACCOUNT]: "subaccount",
        [Proto.ActivityEntityKind.ACTIVITY_ENTITY_MEMBER]: "member",
        [Proto.ActivityEntityKind.ACTIVITY_ENTITY_POLICY]: "policy",
        [Proto.ActivityEntityKind.ACTIVITY_ENTITY_INVITE]: "invite",
        [Proto.ActivityEntityKind.ACTIVITY_ENTITY_SECURITY]: "security",
        [Proto.ActivityEntityKind.ACTIVITY_ENTITY_DESTINATION]: "destination",
    } satisfies ProtoToOutput<Proto.ActivityEntityKind, ActivityEntityKindValue>,
} as const;

export const ActivityEventActionCodec = {
    protoToOutput: {
        [Proto.ActivityEventAction.ACTIVITY_ACTION_UNSPECIFIED]: "unspecified",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_CREATED]: "created",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_UPDATED]: "updated",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_DELETED]: "deleted",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_ENABLED]: "enabled",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_DISABLED]: "disabled",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_REMOVED]: "removed",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_ROLE_SET]: "role_set",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_RECEIVED]: "received",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_REPLIED]: "replied",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_FAILED]: "failed",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_REVOKED]: "revoked",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_BLOCKED]: "blocked",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_HOLD_PLACED]: "hold_placed",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_HOLD_RELEASED]: "hold_released",
    } satisfies ProtoToOutput<Proto.ActivityEventAction, ActivityEventActionValue>,
} as const;

export const ActivityEventSourceCodec = {
    protoToOutput: {
        [Proto.ActivityEventSource.ACTIVITY_SOURCE_UNSPECIFIED]: "unspecified",
        [Proto.ActivityEventSource.ACTIVITY_SOURCE_WEB]: "web",
        [Proto.ActivityEventSource.ACTIVITY_SOURCE_MOBILE]: "mobile",
        [Proto.ActivityEventSource.ACTIVITY_SOURCE_API]: "api",
    } satisfies ProtoToOutput<Proto.ActivityEventSource, ActivityEventSourceValue>,
} as const;
