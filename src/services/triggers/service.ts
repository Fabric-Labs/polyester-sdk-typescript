import { defineService } from "../../core-client.js";
import { TriggersService } from "./triggers.js";

/** Returns the client's TriggersService, creating it on first use. */
export const triggersService = defineService(
    (context) =>
        new TriggersService(context.transports, context.realtime, context.resolver, context.scales),
);
