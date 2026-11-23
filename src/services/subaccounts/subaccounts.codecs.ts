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
    "read_auto_withdraw",
    "manage_auto_withdraw",
    "swap",
    "read_statements",
    "convert_dust",
    "read_funding_flows",
    "read_pnl",
    "stop_strategies",
] as const;
export type SubaccountPermissionValue = (typeof SUBACCOUNT_PERMISSION_VALUES)[number];

export const SUBACCOUNT_INVITE_ACTION_VALUES = ["accept", "decline", "cancel"] as const;
export type SubaccountInviteActionValue = (typeof SUBACCOUNT_INVITE_ACTION_VALUES)[number];

export const SUBACCOUNT_INVITE_STATUS_VALUES = [
    "pending",
    "accepted",
    "declined",
    "canceled",
] as const;
export type SubaccountInviteStatusValue = (typeof SUBACCOUNT_INVITE_STATUS_VALUES)[number];

export const SUBACCOUNT_INVITE_DIRECTION_VALUES = ["", "incoming", "outgoing"] as const;
export type SubaccountInviteDirectionValue = (typeof SUBACCOUNT_INVITE_DIRECTION_VALUES)[number];

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
    "requested",
    "applied",
] as const;
export type ActivityEventActionValue = (typeof ACTIVITY_EVENT_ACTION_VALUES)[number];

/** `system`: Polyester recorded the event by itself, with no client request behind it. */
export const ACTIVITY_EVENT_SOURCE_VALUES = ["web", "mobile", "api", "system"] as const;
export type ActivityEventSourceValue = (typeof ACTIVITY_EVENT_SOURCE_VALUES)[number];

export const ACTIVITY_ACTOR_KIND_VALUES = ["user", "api_key", "system", "unauthenticated"] as const;
export type ActivityActorKindValue = (typeof ACTIVITY_ACTOR_KIND_VALUES)[number];

export const ACTIVITY_API_KEY_KIND_VALUES = [
    "standard",
    "assistant",
    "admin",
    "strategy_bot",
    "broker",
] as const;
export type ActivityApiKeyKindValue = (typeof ACTIVITY_API_KEY_KIND_VALUES)[number];

export const ACTIVITY_BROKER_ROLE_VALUES = [
    "owner",
    "admin",
    "finance",
    "affiliate_manager",
    "viewer",
] as const;
export type ActivityBrokerRoleValue = (typeof ACTIVITY_BROKER_ROLE_VALUES)[number];

export const ACTIVITY_SYSTEM_REASON_VALUES = [
    "assistant_preset_updated",
    "broker_allowlist_change_settled",
    "quickswap_pool_provisioned",
    "quickswap_broker_provisioned",
    "broker_allowlist_change_reconciling",
] as const;
export type ActivitySystemReasonValue = (typeof ACTIVITY_SYSTEM_REASON_VALUES)[number];

export const ACTIVITY_SIGN_IN_METHOD_VALUES = ["wallet", "connected_app"] as const;
export type ActivitySignInMethodValue = (typeof ACTIVITY_SIGN_IN_METHOD_VALUES)[number];

export const ACTIVITY_SIGN_IN_FAILURE_VALUES = [
    "invalid_challenge",
    "challenge_expired",
    "challenge_used",
    "invalid_signature",
    "no_challenge",
] as const;
export type ActivitySignInFailureValue = (typeof ACTIVITY_SIGN_IN_FAILURE_VALUES)[number];

export const ACTIVITY_ELEVATED_ACTION_VALUES = [
    "assistant_access",
    "strategy_bot_access",
    "telegram_link",
] as const;
export type ActivityElevatedActionValue = (typeof ACTIVITY_ELEVATED_ACTION_VALUES)[number];

export const ACTIVITY_ALLOWLIST_ACTION_VALUES = ["add", "remove"] as const;
export type ActivityAllowlistActionValue = (typeof ACTIVITY_ALLOWLIST_ACTION_VALUES)[number];

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
        [Proto.SubaccountPermission.READ_AUTO_WITHDRAW]: "read_auto_withdraw",
        [Proto.SubaccountPermission.MANAGE_AUTO_WITHDRAW]: "manage_auto_withdraw",
        [Proto.SubaccountPermission.SWAP]: "swap",
        [Proto.SubaccountPermission.READ_STATEMENTS]: "read_statements",
        [Proto.SubaccountPermission.CONVERT_DUST]: "convert_dust",
        [Proto.SubaccountPermission.READ_FUNDING_FLOWS]: "read_funding_flows",
        [Proto.SubaccountPermission.READ_PNL]: "read_pnl",
        [Proto.SubaccountPermission.STOP_STRATEGIES]: "stop_strategies",
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
        [Proto.SubaccountInviteStatus.CANCELLED]: "canceled",
    } satisfies ProtoToOutput<Proto.SubaccountInviteStatus, SubaccountInviteStatusValue>,
} as const;

export const SubaccountInviteDirectionCodec = {
    inputToProto: {
        "": Proto.SubaccountInviteDirection.DIRECTION_UNSPECIFIED,
        incoming: Proto.SubaccountInviteDirection.INCOMING,
        outgoing: Proto.SubaccountInviteDirection.OUTGOING,
    } satisfies InputToProto<SubaccountInviteDirectionValue, Proto.SubaccountInviteDirection>,
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
    inputToProto: {
        account: Proto.ActivityEntityKind.ACTIVITY_ENTITY_ACCOUNT,
        session: Proto.ActivityEntityKind.ACTIVITY_ENTITY_SESSION,
        api_key: Proto.ActivityEntityKind.ACTIVITY_ENTITY_API_KEY,
        subaccount: Proto.ActivityEntityKind.ACTIVITY_ENTITY_SUBACCOUNT,
        member: Proto.ActivityEntityKind.ACTIVITY_ENTITY_MEMBER,
        policy: Proto.ActivityEntityKind.ACTIVITY_ENTITY_POLICY,
        invite: Proto.ActivityEntityKind.ACTIVITY_ENTITY_INVITE,
        security: Proto.ActivityEntityKind.ACTIVITY_ENTITY_SECURITY,
        destination: Proto.ActivityEntityKind.ACTIVITY_ENTITY_DESTINATION,
    } satisfies InputToProto<ActivityEntityKindValue, Proto.ActivityEntityKind>,
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
    inputToProto: {
        created: Proto.ActivityEventAction.ACTIVITY_ACTION_CREATED,
        updated: Proto.ActivityEventAction.ACTIVITY_ACTION_UPDATED,
        deleted: Proto.ActivityEventAction.ACTIVITY_ACTION_DELETED,
        enabled: Proto.ActivityEventAction.ACTIVITY_ACTION_ENABLED,
        disabled: Proto.ActivityEventAction.ACTIVITY_ACTION_DISABLED,
        removed: Proto.ActivityEventAction.ACTIVITY_ACTION_REMOVED,
        role_set: Proto.ActivityEventAction.ACTIVITY_ACTION_ROLE_SET,
        received: Proto.ActivityEventAction.ACTIVITY_ACTION_RECEIVED,
        replied: Proto.ActivityEventAction.ACTIVITY_ACTION_REPLIED,
        failed: Proto.ActivityEventAction.ACTIVITY_ACTION_FAILED,
        revoked: Proto.ActivityEventAction.ACTIVITY_ACTION_REVOKED,
        blocked: Proto.ActivityEventAction.ACTIVITY_ACTION_BLOCKED,
        hold_placed: Proto.ActivityEventAction.ACTIVITY_ACTION_HOLD_PLACED,
        hold_released: Proto.ActivityEventAction.ACTIVITY_ACTION_HOLD_RELEASED,
        requested: Proto.ActivityEventAction.ACTIVITY_ACTION_REQUESTED,
        applied: Proto.ActivityEventAction.ACTIVITY_ACTION_APPLIED,
    } satisfies InputToProto<ActivityEventActionValue, Proto.ActivityEventAction>,
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
        [Proto.ActivityEventAction.ACTIVITY_ACTION_REQUESTED]: "requested",
        [Proto.ActivityEventAction.ACTIVITY_ACTION_APPLIED]: "applied",
    } satisfies ProtoToOutput<Proto.ActivityEventAction, ActivityEventActionValue>,
} as const;

export const ActivityEventSourceCodec = {
    inputToProto: {
        web: Proto.ActivityEventSource.ACTIVITY_SOURCE_WEB,
        mobile: Proto.ActivityEventSource.ACTIVITY_SOURCE_MOBILE,
        api: Proto.ActivityEventSource.ACTIVITY_SOURCE_API,
        system: Proto.ActivityEventSource.ACTIVITY_SOURCE_SYSTEM,
    } satisfies InputToProto<ActivityEventSourceValue, Proto.ActivityEventSource>,
    protoToOutput: {
        [Proto.ActivityEventSource.ACTIVITY_SOURCE_UNSPECIFIED]: "unspecified",
        [Proto.ActivityEventSource.ACTIVITY_SOURCE_WEB]: "web",
        [Proto.ActivityEventSource.ACTIVITY_SOURCE_MOBILE]: "mobile",
        [Proto.ActivityEventSource.ACTIVITY_SOURCE_API]: "api",
        [Proto.ActivityEventSource.ACTIVITY_SOURCE_SYSTEM]: "system",
    } satisfies ProtoToOutput<Proto.ActivityEventSource, ActivityEventSourceValue>,
} as const;

export const ActivityActorKindCodec = {
    protoToOutput: {
        [Proto.ActivityActorKind.ACTIVITY_ACTOR_UNSPECIFIED]: "unspecified",
        [Proto.ActivityActorKind.ACTIVITY_ACTOR_USER]: "user",
        [Proto.ActivityActorKind.ACTIVITY_ACTOR_API_KEY]: "api_key",
        [Proto.ActivityActorKind.ACTIVITY_ACTOR_SYSTEM]: "system",
        [Proto.ActivityActorKind.ACTIVITY_ACTOR_UNAUTHENTICATED]: "unauthenticated",
    } satisfies ProtoToOutput<Proto.ActivityActorKind, ActivityActorKindValue>,
} as const;

export const ActivityApiKeyKindCodec = {
    protoToOutput: {
        [Proto.ActivityApiKeyKind.ACTIVITY_KEY_UNSPECIFIED]: "unspecified",
        [Proto.ActivityApiKeyKind.ACTIVITY_KEY_STANDARD]: "standard",
        [Proto.ActivityApiKeyKind.ACTIVITY_KEY_ASSISTANT]: "assistant",
        [Proto.ActivityApiKeyKind.ACTIVITY_KEY_ADMIN]: "admin",
        [Proto.ActivityApiKeyKind.ACTIVITY_KEY_STRATEGY_BOT]: "strategy_bot",
        [Proto.ActivityApiKeyKind.ACTIVITY_KEY_BROKER]: "broker",
    } satisfies ProtoToOutput<Proto.ActivityApiKeyKind, ActivityApiKeyKindValue>,
} as const;

export const ActivityBrokerRoleCodec = {
    protoToOutput: {
        [Proto.ActivityBrokerRole.ACTIVITY_BROKER_ROLE_UNSPECIFIED]: "unspecified",
        [Proto.ActivityBrokerRole.ACTIVITY_BROKER_OWNER]: "owner",
        [Proto.ActivityBrokerRole.ACTIVITY_BROKER_ADMIN]: "admin",
        [Proto.ActivityBrokerRole.ACTIVITY_BROKER_FINANCE]: "finance",
        [Proto.ActivityBrokerRole.ACTIVITY_BROKER_AFFILIATE_MANAGER]: "affiliate_manager",
        [Proto.ActivityBrokerRole.ACTIVITY_BROKER_VIEWER]: "viewer",
    } satisfies ProtoToOutput<Proto.ActivityBrokerRole, ActivityBrokerRoleValue>,
} as const;

export const ActivitySystemReasonCodec = {
    protoToOutput: {
        [Proto.ActivitySystemReason.ACTIVITY_SYSTEM_REASON_UNSPECIFIED]: "unspecified",
        [Proto.ActivitySystemReason.ACTIVITY_SYSTEM_ASSISTANT_PRESET_UPDATED]:
            "assistant_preset_updated",
        [Proto.ActivitySystemReason.ACTIVITY_SYSTEM_BROKER_ALLOWLIST_CHANGE_SETTLED]:
            "broker_allowlist_change_settled",
        [Proto.ActivitySystemReason.ACTIVITY_SYSTEM_QUICKSWAP_POOL_PROVISIONED]:
            "quickswap_pool_provisioned",
        [Proto.ActivitySystemReason.ACTIVITY_SYSTEM_QUICKSWAP_BROKER_PROVISIONED]:
            "quickswap_broker_provisioned",
        [Proto.ActivitySystemReason.ACTIVITY_SYSTEM_BROKER_ALLOWLIST_CHANGE_RECONCILING]:
            "broker_allowlist_change_reconciling",
    } satisfies ProtoToOutput<Proto.ActivitySystemReason, ActivitySystemReasonValue>,
} as const;

export const ActivitySignInMethodCodec = {
    protoToOutput: {
        [Proto.ActivitySignInMethod.ACTIVITY_SIGN_IN_UNSPECIFIED]: "unspecified",
        [Proto.ActivitySignInMethod.ACTIVITY_SIGN_IN_WALLET]: "wallet",
        [Proto.ActivitySignInMethod.ACTIVITY_SIGN_IN_CONNECTED_APP]: "connected_app",
    } satisfies ProtoToOutput<Proto.ActivitySignInMethod, ActivitySignInMethodValue>,
} as const;

export const ActivitySignInFailureCodec = {
    protoToOutput: {
        [Proto.ActivitySignInFailure.UNSPECIFIED]: "unspecified",
        [Proto.ActivitySignInFailure.INVALID_CHALLENGE]: "invalid_challenge",
        [Proto.ActivitySignInFailure.CHALLENGE_EXPIRED]: "challenge_expired",
        [Proto.ActivitySignInFailure.CHALLENGE_USED]: "challenge_used",
        [Proto.ActivitySignInFailure.INVALID_SIGNATURE]: "invalid_signature",
        [Proto.ActivitySignInFailure.NO_CHALLENGE]: "no_challenge",
    } satisfies ProtoToOutput<Proto.ActivitySignInFailure, ActivitySignInFailureValue>,
} as const;

export const ActivityElevatedActionCodec = {
    protoToOutput: {
        [Proto.ActivityElevatedAction.ACTIVITY_ELEVATED_UNSPECIFIED]: "unspecified",
        [Proto.ActivityElevatedAction.ACTIVITY_ELEVATED_ASSISTANT_ACCESS]: "assistant_access",
        [Proto.ActivityElevatedAction.ACTIVITY_ELEVATED_STRATEGY_BOT_ACCESS]: "strategy_bot_access",
        [Proto.ActivityElevatedAction.ACTIVITY_ELEVATED_TELEGRAM_LINK]: "telegram_link",
    } satisfies ProtoToOutput<Proto.ActivityElevatedAction, ActivityElevatedActionValue>,
} as const;

export const ActivityAllowlistActionCodec = {
    protoToOutput: {
        [Proto.ActivityAllowlistAction.ACTIVITY_ALLOWLIST_UNSPECIFIED]: "unspecified",
        [Proto.ActivityAllowlistAction.ACTIVITY_ALLOWLIST_ADD]: "add",
        [Proto.ActivityAllowlistAction.ACTIVITY_ALLOWLIST_REMOVE]: "remove",
    } satisfies ProtoToOutput<Proto.ActivityAllowlistAction, ActivityAllowlistActionValue>,
} as const;
