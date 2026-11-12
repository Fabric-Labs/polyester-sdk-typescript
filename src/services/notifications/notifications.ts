import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/notifications/v1/notifications_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { InternalServerError } from "../../shared/errors.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    formatNotification,
    formatNotificationCounts,
    GetNotificationInputSchema,
    ListNotificationsInputSchema,
    MarkAllNotificationsReadInputSchema,
    MarkNotificationsInputSchema,
    type AccountNotification,
    type GetNotificationInput,
    type ListNotificationsInput,
    type ListNotificationsResult,
    type MarkAllNotificationsReadInput,
    type MarkNotificationsInput,
    type NotificationCounts,
} from "./notifications.schemas.js";

/**
 * Reads and marks the caller's notification center. Available on devnet only. Session JWT only:
 * API keys are refused. An unknown notification ID, including another account's, throws
 * `ResourceNotFoundError` (`NOTIFICATION_NOT_FOUND`); a retryable `ServiceUnavailableError`
 * means retry the same request.
 */
export class NotificationsService {
    #client: Client<typeof Proto.NotificationService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.NotificationService, transports.authApi);
    }

    /** Lists the caller's notifications, newest first. */
    async list(
        input: ListNotificationsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListNotificationsResult> {
        const request = parse(ListNotificationsInputSchema, input);
        const response = await this.#client.listNotifications(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            notifications: response.notifications.map(formatNotification),
            nextPageToken: response.nextPageToken,
        };
    }

    /** Reads one notification. */
    async get(
        input: GetNotificationInput,
        options?: PolyesterRequestOptions,
    ): Promise<AccountNotification> {
        const request = parse(GetNotificationInputSchema, input);
        const { notification } = await this.#client.getNotification(
            request,
            toConnectCallOptions(options),
        );
        if (!notification) throw new InternalServerError("Response has no notification.");
        return formatNotification(notification);
    }

    /** Counts the caller's notifications and unread notifications, in total and by type. */
    async getCounts(options?: PolyesterRequestOptions): Promise<NotificationCounts> {
        const response = await this.#client.getNotificationCounts(
            {},
            toConnectCallOptions(options),
        );
        return formatNotificationCounts(response);
    }

    /**
     * Marks notifications read. All or nothing: one unknown ID throws `ResourceNotFoundError`
     * and marks none. `changed` leaves out notifications already read.
     */
    async markRead(
        input: MarkNotificationsInput,
        options?: PolyesterRequestOptions,
    ): Promise<{ changed: number }> {
        const request = parse(MarkNotificationsInputSchema, input);
        const response = await this.#client.markNotificationsRead(
            request,
            toConnectCallOptions(options),
        );
        return { changed: response.changed };
    }

    /**
     * Marks notifications unread. All or nothing: one unknown ID throws `ResourceNotFoundError`
     * and marks none. `changed` leaves out notifications already unread.
     */
    async markUnread(
        input: MarkNotificationsInput,
        options?: PolyesterRequestOptions,
    ): Promise<{ changed: number }> {
        const request = parse(MarkNotificationsInputSchema, input);
        const response = await this.#client.markNotificationsUnread(
            request,
            toConnectCallOptions(options),
        );
        return { changed: response.changed };
    }

    /** Marks every unread notification read, within the given categories and up to the given one. */
    async markAllRead(
        input: MarkAllNotificationsReadInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ changed: number }> {
        const request = parse(MarkAllNotificationsReadInputSchema, input);
        const response = await this.#client.markAllNotificationsRead(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return { changed: Number(response.changed) };
    }
}
