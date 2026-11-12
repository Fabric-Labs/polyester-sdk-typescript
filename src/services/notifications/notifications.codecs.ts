import * as Proto from "../../gen/notifications/v1/notifications_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const NOTIFICATION_TYPE_VALUES = ["price_alert", "telegram_approval"] as const;
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

export const NotificationTypeCodec = {
    protoToOutput: {
        [Proto.NotificationType.TYPE_UNSPECIFIED]: "unspecified",
        [Proto.NotificationType.PRICE_ALERT]: "price_alert",
        [Proto.NotificationType.TELEGRAM_APPROVAL]: "telegram_approval",
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
