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

export const SUBACCOUNT_INVITE_ACTION_VALUES = ["accept", "decline", "cancel"] as const;
export type SubaccountInviteActionValue = (typeof SUBACCOUNT_INVITE_ACTION_VALUES)[number];

export const SUBACCOUNT_INVITE_STATUS_VALUES = [
    "pending",
    "accepted",
    "declined",
    "cancelled",
] as const;
export type SubaccountInviteStatusValue = (typeof SUBACCOUNT_INVITE_STATUS_VALUES)[number];

export const SUBACCOUNT_STATUS_VALUES = ["active", "disabled", "deleted"] as const;
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
type SubaccountStatusProto = Proto.SubaccountUpdateSpec["status"] & Proto.Subaccount["status"];

const SubaccountStatusProto = {
    ACTIVE: "active",
    DISABLED: "disabled",
    DELETED: "deleted",
} as const satisfies Record<string, SubaccountStatusProto>;

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
        active: SubaccountStatusProto.ACTIVE,
        disabled: SubaccountStatusProto.DISABLED,
        deleted: SubaccountStatusProto.DELETED,
    } satisfies Record<SubaccountStatusValue, SubaccountStatusProto>,
    protoToOutput: {
        [SubaccountStatusProto.ACTIVE]: "active",
        [SubaccountStatusProto.DISABLED]: "disabled",
        [SubaccountStatusProto.DELETED]: "deleted",
    } satisfies Record<SubaccountStatusProto, SubaccountStatusValue>,
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
