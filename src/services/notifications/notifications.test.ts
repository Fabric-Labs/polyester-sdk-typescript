import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import * as Alerts from "../../gen/alerts/v1/price_alerts_pb.js";
import * as Proto from "../../gen/notifications/v1/notifications_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import {
    ResourceNotFoundError,
    ServiceUnavailableError,
    ValidationError,
} from "../../shared/errors.js";
import { rejectingUnaryTransport, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { NotificationsService } from "./notifications.js";

const E9 = 1_000_000_000n;
const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

function rawNotification(overrides: Record<string, unknown> = {}) {
    return {
        notificationId: 501n,
        type: Proto.NotificationType.PRICE_ALERT,
        category: Proto.NotificationCategory.ALERTS,
        title: "Price alert",
        text: "BTC/USDT rose to 90,001.",
        createdAt: ts(1_700_000_000),
        detail: {
            case: "priceAlert",
            value: {
                alertId: 77n,
                symbolId: 3,
                direction: Alerts.AlertDirection.ABOVE,
                priceSource: Alerts.AlertPriceSource.LAST_PRICE,
                priceTicks: 90_000n * E9,
                triggeredPriceTicks: 90_001_500_000_000n,
                triggeredAt: ts(1_699_999_999),
            },
        },
        ...overrides,
    };
}

function serviceWith(response: Record<string, unknown>) {
    const transport = unaryTransport(response);
    return { transport, service: new NotificationsService({ authApi: transport.transport }) };
}

describe("NotificationsService", () => {
    it("lists with filters and formats a price alert notice", async () => {
        const { transport, service } = serviceWith({
            notifications: [rawNotification()],
            nextPageToken: "n",
        });
        const page = await service.list({
            categories: ["alerts", "security"],
            readState: "unread",
            startTime: 1_000,
            endTime: 2_000,
            limit: 100,
            pageToken: " p ",
        });

        expect(transport.lastCall()?.message).toEqual({
            categories: [Proto.NotificationCategory.ALERTS, Proto.NotificationCategory.SECURITY],
            readState: Proto.ReadState.UNREAD,
            startTime: { seconds: 1n, nanos: 0 },
            endTime: { seconds: 2n, nanos: 0 },
            limit: 100,
            pageToken: "p",
        });
        expect(page).toEqual({
            nextPageToken: "n",
            notifications: [
                {
                    notificationId: formatId(501n),
                    type: "price_alert",
                    category: "alerts",
                    title: "Price alert",
                    text: "BTC/USDT rose to 90,001.",
                    createdAt: 1_700_000_000_000,
                    readAt: null,
                    detail: {
                        type: "price_alert",
                        alertId: formatId(77n),
                        symbolId: 3,
                        direction: "above",
                        priceSource: "last_price",
                        price: "90000",
                        triggeredPrice: "90001.5",
                        triggeredAt: 1_699_999_999_000,
                    },
                },
            ],
        });
    });

    it("formats a Telegram approval notice", async () => {
        const { transport, service } = serviceWith({
            notification: rawNotification({
                type: Proto.NotificationType.TELEGRAM_APPROVAL,
                category: Proto.NotificationCategory.SECURITY,
                readAt: ts(1_700_000_100),
                detail: {
                    case: "telegramApproval",
                    value: {
                        approvalId: 9n,
                        action: Proto.TelegramApprovalAction.CANCEL_ALL_ORDERS,
                        accountId: 12n,
                        summary: "Cancel all BTC/USDT orders",
                        parameters: [{ label: "Market", value: "BTC/USDT" }],
                        approvedAt: ts(1_700_000_050),
                    },
                },
            }),
        });
        const notification = await service.get({ notificationId: formatId(501n) });

        expect(transport.lastCall()?.message).toEqual({ notificationId: 501n });
        expect(notification).toMatchObject({
            type: "telegram_approval",
            category: "security",
            readAt: 1_700_000_100_000,
            detail: {
                type: "telegram_approval",
                approvalId: formatId(9n),
                action: "cancel_all_orders",
                accountId: formatId(12n),
                summary: "Cancel all BTC/USDT orders",
                parameters: [{ label: "Market", value: "BTC/USDT" }],
                approvedAt: 1_700_000_050_000,
            },
        });
    });

    it("formats a broker allowlist notice with public IDs and an exact chain ID", async () => {
        const { service } = serviceWith({
            notification: rawNotification({
                type: Proto.NotificationType.BROKER_ALLOWLIST_CHANGE,
                category: Proto.NotificationCategory.SECURITY,
                detail: {
                    case: "brokerAllowlist",
                    value: {
                        broker: "acme",
                        vaultAccountId: 21n,
                        changeId: 22n,
                        event: Proto.BrokerAllowlistEvent.CHANGE_REQUESTED,
                        action: Proto.BrokerAllowlistAction.ADD_DESTINATION,
                        destinationChainId: 18_446_744_073_709_551_615n,
                        destinationAddress: "0x1111111111111111111111111111111111111111",
                        label: "Treasury",
                        requestedByAccountId: 23n,
                    },
                },
            }),
        });

        expect(await service.get({ notificationId: formatId(501n) })).toMatchObject({
            type: "broker_allowlist_change",
            category: "security",
            detail: {
                type: "broker_allowlist_change",
                broker: "acme",
                vaultAccountId: formatId(21n),
                changeId: formatId(22n),
                event: "change_requested",
                action: "add_destination",
                destinationChainId: "18446744073709551615",
                destinationAddress: "0x1111111111111111111111111111111111111111",
                label: "Treasury",
                requestedByAccountId: formatId(23n),
            },
        });
    });

    it("keeps a notification of an unknown type readable through title and text", async () => {
        const { service } = serviceWith({
            notifications: [
                rawNotification({ type: 99, category: 7, detail: { case: undefined } }),
            ],
            nextPageToken: "",
        });
        const { notifications } = await service.list();
        expect(notifications[0]).toMatchObject({
            type: "unspecified",
            category: "unspecified",
            title: "Price alert",
            text: "BTC/USDT rose to 90,001.",
            detail: { type: "unspecified" },
        });
    });

    it("counts by type as numbers", async () => {
        const { service } = serviceWith({
            total: 5n,
            unread: 2n,
            types: [
                {
                    type: Proto.NotificationType.PRICE_ALERT,
                    category: Proto.NotificationCategory.ALERTS,
                    total: 5n,
                    unread: 2n,
                },
            ],
        });
        expect(await service.getCounts()).toEqual({
            total: 5,
            unread: 2,
            types: [{ type: "price_alert", category: "alerts", total: 5, unread: 2 }],
        });
    });

    it("marks notifications read, unread and all read", async () => {
        const { transport, service } = serviceWith({ changed: 2 });
        const ids = [formatId(1n), formatId(2n)];

        expect(await service.markRead({ notificationIds: ids })).toEqual({ changed: 2 });
        expect(transport.lastCall()?.message).toEqual({ notificationIds: [1n, 2n] });
        await service.markUnread({ notificationIds: ids });
        expect(transport.lastCall()?.method.localName).toBe("markNotificationsUnread");

        await service.markAllRead({ categories: ["security"], throughNotificationId: ids[1] });
        expect(transport.lastCall()?.message).toEqual({
            categories: [Proto.NotificationCategory.SECURITY],
            throughNotificationId: 2n,
        });
        await service.markAllRead();
        expect(transport.lastCall()?.message).toEqual({});
    });

    it.each([
        ["list limit 0", (s: NotificationsService) => s.list({ limit: 0 })],
        ["list limit 101", (s: NotificationsService) => s.list({ limit: 101 })],
        [
            "endTime not after startTime",
            (s: NotificationsService) => s.list({ startTime: 2, endTime: 2 }),
        ],
        [
            "an unknown category",
            (s: NotificationsService) => s.list({ categories: ["news" as "alerts"] }),
        ],
        ["no IDs to mark", (s: NotificationsService) => s.markRead({ notificationIds: [] })],
        [
            "101 IDs to mark",
            (s: NotificationsService) =>
                s.markUnread({
                    notificationIds: Array.from({ length: 101 }, (_, i) => formatId(BigInt(i + 1))),
                }),
        ],
        [
            "a repeated ID",
            (s: NotificationsService) =>
                s.markRead({ notificationIds: [formatId(1n), formatId(1n)] }),
        ],
    ])("rejects %s before sending", async (_name, call) => {
        const { transport, service } = serviceWith({});
        await expect(call(service)).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });

    it("accepts 100 IDs to mark", async () => {
        const { transport, service } = serviceWith({ changed: 100 });
        await service.markRead({
            notificationIds: Array.from({ length: 100 }, (_, i) => formatId(BigInt(i + 1))),
        });
        expect(transport.calls).toHaveLength(1);
    });

    it.each([
        [Code.NotFound, Proto.ErrorCode.NOTIFICATION_NOT_FOUND, ResourceNotFoundError],
        [Code.Unavailable, Proto.ErrorCode.SERVICE_UNAVAILABLE, ServiceUnavailableError],
    ])(
        "maps %s %s to its typed error with the notifications detail",
        async (code, errorCode, type) => {
            const error = new ConnectError("rejected", code, undefined, [
                {
                    desc: Proto.ErrorDetailSchema,
                    value: create(Proto.ErrorDetailSchema, { code: errorCode }),
                },
            ]);
            const service = new NotificationsService({
                authApi: createErrorMappingTransport(rejectingUnaryTransport(error)),
            });
            const rejected = service.get({ notificationId: formatId(1n) });
            await expect(rejected).rejects.toBeInstanceOf(type);
            await expect(rejected).rejects.toMatchObject({
                retryable: type === ServiceUnavailableError,
                detail: { service: "notifications", code: Proto.ErrorCode[errorCode] },
            });
        },
    );
});
