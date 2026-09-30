import { defineService } from "../../core-client.js";
import { DepositService } from "./deposit.js";

/** Returns the client's DepositService, creating it on first use. */
export const depositService = defineService(
    (context) => new DepositService(context.transports, context.resolver),
);
