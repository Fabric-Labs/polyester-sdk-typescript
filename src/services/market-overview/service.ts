import { defineService } from "../../core-client.js";
import { MarketOverviewService } from "./market-overview.js";

/** Returns the client's MarketOverviewService, creating it on first use. */
export const marketOverviewService = defineService(
    (context) => new MarketOverviewService(context.transports, context.realtime, context.scales),
);
