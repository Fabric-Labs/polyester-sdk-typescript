import { defineService } from "../../core-client.js";
import { ProfitAndLossService } from "./profit-and-loss.js";

/** Returns the client's ProfitAndLossService, creating it on first use. */
export const profitAndLossService = defineService(
    (context) => new ProfitAndLossService(context.transports, context.resolver),
);
