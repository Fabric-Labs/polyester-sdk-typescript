import { defineService } from "../../core-client.js";
import { NotificationsService } from "./notifications.js";

/** Returns the client's NotificationsService, creating it on first use. */
export const notificationsService = defineService(
    (context) => new NotificationsService(context.transports),
);
