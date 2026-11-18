import { defineService } from "../../core-client.js";
import { AccountActivityService } from "./account-activity.js";

/** Returns the client's AccountActivityService, creating it on first use. */
export const accountActivityService = defineService(
    (context) => new AccountActivityService(context.transports),
);
