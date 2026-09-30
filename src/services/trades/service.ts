import { defineService } from "../../core-client.js";
import { TradesService } from "./trades.js";

/** Returns the client's TradesService, creating it on first use. */
export const tradesService = defineService(
    (context) =>
        new TradesService(context.transports, context.realtime, context.resolver, context.scales),
);
