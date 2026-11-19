import { defineService } from "../../core-client.js";
import { ConnectedAppsService } from "./connected-apps.js";

/** Returns the client's ConnectedAppsService, creating it on first use. */
export const connectedAppsService = defineService(
    (context) => new ConnectedAppsService(context.transports),
);
