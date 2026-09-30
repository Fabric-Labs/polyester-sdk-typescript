import { defineService } from "../../core-client.js";
import { ChainAnalyticsService } from "./chain-analytics.js";

/** Returns the client's ChainAnalyticsService, creating it on first use. */
export const chainAnalyticsService = defineService(
    (context) => new ChainAnalyticsService(context.transports, context.scales),
);
