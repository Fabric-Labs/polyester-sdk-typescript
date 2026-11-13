import * as Proto from "../../gen/notifications/v1/notifications_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const NOTIFICATION_TYPE_VALUES = [
    "price_alert",
    "telegram_approval",
    "broker_allowlist_change",
] as const;
/** What a notification reports; each type belongs to one category. */
export type NotificationType = (typeof NOTIFICATION_TYPE_VALUES)[number];

export const NOTIFICATION_CATEGORY_VALUES = ["alerts", "security"] as const;
/** `alerts` holds alerts the caller set; `security` holds account security events. */
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY_VALUES)[number];

export const NOTIFICATION_READ_STATE_VALUES = ["unread", "read"] as const;
export type NotificationReadState = (typeof NOTIFICATION_READ_STATE_VALUES)[number];

export const TELEGRAM_APPROVAL_ACTION_VALUES = [
    "place_order",
    "place_orders",
    "modify_orders",
    "cancel_order",
    "cancel_all_orders",
    "modify_trigger",
    "pause_trigger",
    "resume_trigger",
    "swap",
] as const;
/** What an approval from the linked Telegram account approved. */
export type TelegramApprovalAction = (typeof TELEGRAM_APPROVAL_ACTION_VALUES)[number];

export const BROKER_ALLOWLIST_EVENT_VALUES = [
    "change_requested",
    "change_applied",
    "change_not_applied",
] as const;
/** What happened to a broker vault payout address change. `change_not_applied` is final. */
export type BrokerAllowlistEvent = (typeof BROKER_ALLOWLIST_EVENT_VALUES)[number];

export const BROKER_ALLOWLIST_ACTION_VALUES = ["add_destination", "remove_destination"] as const;
/** Whether a broker vault payout address change adds or removes the address. */
export type BrokerAllowlistAction = (typeof BROKER_ALLOWLIST_ACTION_VALUES)[number];

export const NotificationTypeCodec = {
    protoToOutput: {
        [Proto.NotificationType.TYPE_UNSPECIFIED]: "unspecified",
        [Proto.NotificationType.PRICE_ALERT]: "price_alert",
        [Proto.NotificationType.TELEGRAM_APPROVAL]: "telegram_approval",
        [Proto.NotificationType.BROKER_ALLOWLIST_CHANGE]: "broker_allowlist_change",
    } satisfies ProtoToOutput<Proto.NotificationType, NotificationType>,
} as const;

export const NotificationCategoryCodec = {
    inputToProto: {
        alerts: Proto.NotificationCategory.ALERTS,
        security: Proto.NotificationCategory.SECURITY,
    } satisfies InputToProto<NotificationCategory, Proto.NotificationCategory>,
    protoToOutput: {
        [Proto.NotificationCategory.CATEGORY_UNSPECIFIED]: "unspecified",
        [Proto.NotificationCategory.ALERTS]: "alerts",
        [Proto.NotificationCategory.SECURITY]: "security",
    } satisfies ProtoToOutput<Proto.NotificationCategory, NotificationCategory>,
} as const;

export const NotificationReadStateCodec = {
    inputToProto: {
        unread: Proto.ReadState.UNREAD,
        read: Proto.ReadState.READ,
    } satisfies InputToProto<NotificationReadState, Proto.ReadState>,
} as const;

export const TelegramApprovalActionCodec = {
    protoToOutput: {
        [Proto.TelegramApprovalAction.ACTION_UNSPECIFIED]: "unspecified",
        [Proto.TelegramApprovalAction.PLACE_ORDER]: "place_order",
        [Proto.TelegramApprovalAction.PLACE_ORDERS]: "place_orders",
        [Proto.TelegramApprovalAction.MODIFY_ORDERS]: "modify_orders",
        [Proto.TelegramApprovalAction.CANCEL_ORDER]: "cancel_order",
        [Proto.TelegramApprovalAction.CANCEL_ALL_ORDERS]: "cancel_all_orders",
        [Proto.TelegramApprovalAction.MODIFY_TRIGGER]: "modify_trigger",
        [Proto.TelegramApprovalAction.PAUSE_TRIGGER]: "pause_trigger",
        [Proto.TelegramApprovalAction.RESUME_TRIGGER]: "resume_trigger",
        [Proto.TelegramApprovalAction.SWAP]: "swap",
    } satisfies ProtoToOutput<Proto.TelegramApprovalAction, TelegramApprovalAction>,
} as const;

export const BrokerAllowlistEventCodec = {
    protoToOutput: {
        [Proto.BrokerAllowlistEvent.BROKER_ALLOWLIST_EVENT_UNSPECIFIED]: "unspecified",
        [Proto.BrokerAllowlistEvent.CHANGE_REQUESTED]: "change_requested",
        [Proto.BrokerAllowlistEvent.CHANGE_APPLIED]: "change_applied",
        [Proto.BrokerAllowlistEvent.CHANGE_NOT_APPLIED]: "change_not_applied",
    } satisfies ProtoToOutput<Proto.BrokerAllowlistEvent, BrokerAllowlistEvent>,
} as const;

export const BrokerAllowlistActionCodec = {
    protoToOutput: {
        [Proto.BrokerAllowlistAction.BROKER_ALLOWLIST_ACTION_UNSPECIFIED]: "unspecified",
        [Proto.BrokerAllowlistAction.ADD_DESTINATION]: "add_destination",
        [Proto.BrokerAllowlistAction.REMOVE_DESTINATION]: "remove_destination",
    } satisfies ProtoToOutput<Proto.BrokerAllowlistAction, BrokerAllowlistAction>,
} as const;
