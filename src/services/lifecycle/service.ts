import { defineService } from "../../core-client.js";
import { LifecycleService } from "./lifecycle.js";

/** Returns the client's LifecycleService, creating it on first use. */
export const lifecycleService = defineService(
    (context) => new LifecycleService(context.transports, context.realtime),
);
