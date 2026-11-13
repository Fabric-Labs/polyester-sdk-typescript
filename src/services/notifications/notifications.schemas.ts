import * as v from "valibot";
import { PRICE_SCALE } from "../../catalogs/readers.js";
import type * as Proto from "../../gen/notifications/v1/notifications_pb.js";
import { scaledToDecimalOutput } from "../../shared/decimal-surface.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import { idInputSchema, optionalIdInputSchema } from "../../shared/schemas.js";
import { formatId } from "../../utils/base58-id.js";
import { tsObjToMs } from "../../utils/time.js";
import { msToTimestamp } from "../../utils/timestamp.js";
import {
    PriceAlertDirectionCodec,
    PriceAlertPriceSourceCodec,
} from "../price-alerts/price-alerts.codecs.js";
import {
    BrokerAllowlistActionCodec,
    BrokerAllowlistEventCodec,
    NOTIFICATION_CATEGORY_VALUES,
    NOTIFICATION_READ_STATE_VALUES,
    NotificationCategoryCodec,
    NotificationReadStateCodec,
    NotificationTypeCodec,
    TelegramApprovalActionCodec,
} from "./notifications.codecs.js";

const NotificationIdInputSchema = idInputSchema("notificationId");

/** Omit or pass empty for every category. */
const CategoriesInputSchema = v.optional(
    v.pipe(
        v.array(v.picklist(NOTIFICATION_CATEGORY_VALUES)),
        v.transform((categories) =>
            categories.map((category) => NotificationCategoryCodec.inputToProto[category]),
        ),
    ),
);

const TimestampMsInputSchema = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(Number.MAX_SAFE_INTEGER),
);

export const ListNotificationsInputSchema = v.pipe(
    v.strictObject({
        categories: CategoriesInputSchema,
        /** Only read or only unread notifications; omit for both. */
        readState: v.optional(v.picklist(NOTIFICATION_READ_STATE_VALUES)),
        /** Epoch ms, inclusive. */
        startTime: v.optional(TimestampMsInputSchema),
        /** Epoch ms, exclusive; after `startTime` when both are set. */
        endTime: v.optional(TimestampMsInputSchema),
        /** Page size: default 25, at most 100. */
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
        /** Previous `nextPageToken`; reuse only with the same filters. */
        pageToken: v.optional(v.pipe(v.string(), v.trim())),
    }),
    v.check(
        ({ startTime, endTime }) =>
            startTime === undefined || endTime === undefined || endTime > startTime,
        "endTime: must be after startTime",
    ),
    v.transform(({ readState, startTime, endTime, ...input }) => ({
        ...input,
        readState: readState && NotificationReadStateCodec.inputToProto[readState],
        startTime: startTime === undefined ? undefined : msToTimestamp(startTime),
        endTime: endTime === undefined ? undefined : msToTimestamp(endTime),
    })),
);

export type ListNotificationsInput = v.InferInput<typeof ListNotificationsInputSchema>;

export const GetNotificationInputSchema = v.strictObject({
    notificationId: NotificationIdInputSchema,
});

export type GetNotificationInput = v.InferInput<typeof GetNotificationInputSchema>;

export const MarkNotificationsInputSchema = v.strictObject({
    /** One to 100 distinct notification IDs. */
    notificationIds: v.pipe(
        v.array(NotificationIdInputSchema),
        v.minLength(1, "At least one notification ID is required."),
        v.maxLength(100, "At most 100 notification IDs are allowed."),
        v.check((ids) => new Set(ids).size === ids.length, "Notification IDs must be distinct."),
    ),
});

export type MarkNotificationsInput = v.InferInput<typeof MarkNotificationsInputSchema>;

export const MarkAllNotificationsReadInputSchema = v.strictObject({
    categories: CategoriesInputSchema,
    /**
     * Mark only this notification and older ones. Pass the newest one shown, so one that arrives
     * later stays unread; omit to mark every notification that exists when the call runs.
     */
    throughNotificationId: optionalIdInputSchema("throughNotificationId"),
});

export type MarkAllNotificationsReadInput = v.InferInput<
    typeof MarkAllNotificationsReadInputSchema
>;

/*
 * Outputs are formatted straight from the decoded messages, like the assistant's run events.
 * The `detail` oneof becomes a `type`-tagged union; a case this build does not know becomes
 * `{ type: "unspecified" }`, and the notification's `title` and `text` describe it.
 */

const price = (ticks: bigint) => scaledToDecimalOutput(ticks, PRICE_SCALE);

function formatDetail(detail: Proto.Notification["detail"]) {
    switch (detail.case) {
        case "priceAlert": {
            const notice = detail.value;
            return {
                type: "price_alert" as const,
                /** The alert's ID in `client.priceAlerts`. */
                alertId: formatId(notice.alertId),
                symbolId: notice.symbolId,
                direction: enumLabel(PriceAlertDirectionCodec.protoToOutput, notice.direction),
                priceSource: enumLabel(
                    PriceAlertPriceSourceCodec.protoToOutput,
                    notice.priceSource,
                ),
                /** Alert price, as a decimal string. */
                price: price(notice.priceTicks),
                /** Price that fired the alert, as a decimal string. */
                triggeredPrice: price(notice.triggeredPriceTicks),
                triggeredAt: tsObjToMs(notice.triggeredAt) ?? null,
            };
        }
        case "telegramApproval": {
            const notice = detail.value;
            return {
                type: "telegram_approval" as const,
                /** The approval's ID in `client.assistant`. */
                approvalId: formatId(notice.approvalId),
                action: enumLabel(TelegramApprovalActionCodec.protoToOutput, notice.action),
                /** Trading account (subaccount) the action acted on. */
                accountId: formatId(notice.accountId),
                summary: notice.summary,
                /** Key parameters in display order, such as market, side and quantity. */
                parameters: notice.parameters.map(({ label, value }) => ({ label, value })),
                approvedAt: tsObjToMs(notice.approvedAt) ?? null,
            };
        }
        case "brokerAllowlist": {
            const notice = detail.value;
            return {
                type: "broker_allowlist_change" as const,
                broker: notice.broker,
                /** Sub-account ID of the broker vault. */
                vaultAccountId: formatId(notice.vaultAccountId),
                /** The change's ID; key the broker's vault allowlist view on it. */
                changeId: formatId(notice.changeId),
                event: enumLabel(BrokerAllowlistEventCodec.protoToOutput, notice.event),
                action: enumLabel(BrokerAllowlistActionCodec.protoToOutput, notice.action),
                /** Destination chain ID, as a decimal string. */
                destinationChainId: notice.destinationChainId.toString(),
                destinationAddress: notice.destinationAddress,
                /** The requesting member's name for an added address; empty when none. */
                label: notice.label,
                /**
                 * Account ID of the member who requested the change. Show a `change_requested`
                 * the caller did not make prominently: an added address becomes payable 24 hours
                 * after it is listed.
                 */
                requestedByAccountId: formatId(notice.requestedByAccountId),
            };
        }
        default:
            return { type: "unspecified" as const };
    }
}

export function formatNotification(notification: Proto.Notification) {
    return {
        notificationId: formatId(notification.notificationId),
        type: enumLabel(NotificationTypeCodec.protoToOutput, notification.type),
        category: enumLabel(NotificationCategoryCodec.protoToOutput, notification.category),
        /** Plain-text title, the same for every notification of a type. */
        title: notification.title,
        /** Plain-text summary; may span several lines. */
        text: notification.text,
        createdAt: tsObjToMs(notification.createdAt) ?? null,
        /** Null while unread. */
        readAt: tsObjToMs(notification.readAt) ?? null,
        detail: formatDetail(notification.detail),
    };
}

/**
 * One notification. When `detail.type` is `"unspecified"` (a type this SDK build does not
 * know), show `title` and `text` only.
 */
export type AccountNotification = ReturnType<typeof formatNotification>;

export type AccountNotificationDetail = AccountNotification["detail"];

/** One page of notifications, newest first; an empty `nextPageToken` means no more. */
export type ListNotificationsResult = {
    notifications: AccountNotification[];
    nextPageToken: string;
};

export function formatNotificationCounts(counts: Proto.GetNotificationCountsResponse) {
    return {
        total: Number(counts.total),
        unread: Number(counts.unread),
        /** Every type in ascending enum order, including types with no notification. */
        types: counts.types.map((count) => ({
            type: enumLabel(NotificationTypeCodec.protoToOutput, count.type),
            category: enumLabel(NotificationCategoryCodec.protoToOutput, count.category),
            total: Number(count.total),
            unread: Number(count.unread),
        })),
    };
}

/** Exact counts of the caller's notifications, as of one moment. */
export type NotificationCounts = ReturnType<typeof formatNotificationCounts>;
