import { defineService } from "../../core-client.js";
import { CandlesService } from "./candles.js";

/** Returns the client's CandlesService, creating it on first use. */
export const candlesService = defineService(
    (context) => new CandlesService(context.transports, context.realtime, context.scales),
);
