import { defineService } from "../../core-client.js";
import { ApiKeysService } from "./api-keys.js";

/** Returns the client's ApiKeysService, creating it on first use. */
export const apiKeysService = defineService(
    (context) => new ApiKeysService(context.transports, context.realtime, context.resolver),
);
