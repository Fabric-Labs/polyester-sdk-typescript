import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";

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

export const RAW_SUBACCOUNT_STATUS_VALUES = ["active", "disabled", "deleted"] as const;
export type RawSubaccountStatusValue = (typeof RAW_SUBACCOUNT_STATUS_VALUES)[number];

export const SUBACCOUNT_STATUS_VALUES = ["active", "frozen"] as const;
export type SubaccountStatusValue = (typeof SUBACCOUNT_STATUS_VALUES)[number];

export const SubaccountRoleCodec = {
    inputToProto: {
        owner: Proto.SubaccountRole.OWNER,
        admin: Proto.SubaccountRole.ADMIN,
        treasury: Proto.SubaccountRole.TREASURY,
        leveraged_trader: Proto.SubaccountRole.LEVERAGED_TRADER,
        trader: Proto.SubaccountRole.TRADER,
        viewer: Proto.SubaccountRole.VIEWER,
    } satisfies Record<SubaccountRoleValue, Proto.SubaccountRole>,
    protoToOutput: {
        [Proto.SubaccountRole.OWNER]: "owner",
        [Proto.SubaccountRole.ADMIN]: "admin",
        [Proto.SubaccountRole.TREASURY]: "treasury",
        [Proto.SubaccountRole.LEVERAGED_TRADER]: "leveraged_trader",
        [Proto.SubaccountRole.TRADER]: "trader",
        [Proto.SubaccountRole.VIEWER]: "viewer",
        [Proto.SubaccountRole.SUBACCOUNT_ROLE_UNSPECIFIED]: "viewer",
    } satisfies Record<Proto.SubaccountRole, SubaccountRoleValue>,
} as const;

export const InviteActionCodec = {
    inputToProto: {
        accept: Proto.SubaccountInviteAction.ACCEPT,
        decline: Proto.SubaccountInviteAction.DECLINE,
        cancel: Proto.SubaccountInviteAction.CANCEL,
    } satisfies Record<SubaccountInviteActionValue, Proto.SubaccountInviteAction>,
} as const;

export const InviteStatusCodec = {
    protoToOutput: {
        [Proto.SubaccountInviteStatus.PENDING]: "pending",
        [Proto.SubaccountInviteStatus.ACCEPTED]: "accepted",
        [Proto.SubaccountInviteStatus.DECLINED]: "declined",
        [Proto.SubaccountInviteStatus.CANCELLED]: "cancelled",
        [Proto.SubaccountInviteStatus.UNSPECIFIED]: "pending",
    } satisfies Record<Proto.SubaccountInviteStatus, SubaccountInviteStatusValue>,
} as const;

export const RawSubaccountStatusCodec = {
    rawToOutput: {
        active: "active",
        disabled: "frozen",
        deleted: "frozen",
    } satisfies Record<RawSubaccountStatusValue, SubaccountStatusValue>,
} as const;
