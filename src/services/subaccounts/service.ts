import { defineService } from "../../core-client.js";
import { SubaccountsService } from "./subaccounts.js";

/** Returns the client's SubaccountsService, creating it on first use. */
export const subaccountsService = defineService(
    (context) => new SubaccountsService(context.transports, context.realtime, context.resolver),
);
