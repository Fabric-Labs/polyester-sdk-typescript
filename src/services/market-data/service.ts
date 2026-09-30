import { defineService } from "../../core-client.js";
import { MarketDataService } from "./market-data.js";

/** Returns the client's MarketDataService, creating it on first use. */
export const marketDataService = defineService(
    (context) => new MarketDataService(context.transports, context.realtime, context.scales),
);
