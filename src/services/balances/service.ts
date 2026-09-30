import { defineService } from "../../core-client.js";
import { BalancesService } from "./balances.js";

/** Returns the client's BalancesService, creating it on first use. */
export const balancesService = defineService(
    (context) =>
        new BalancesService(context.transports, context.realtime, context.resolver, context.scales),
);
