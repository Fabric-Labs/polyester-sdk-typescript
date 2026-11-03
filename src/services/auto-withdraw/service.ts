import { defineService } from "../../core-client.js";
import { AutoWithdrawService } from "./auto-withdraw.js";

/** Returns the client's AutoWithdrawService, creating it on first use. */
export const autoWithdrawService = defineService(
    (context) => new AutoWithdrawService(context.transports, context.resolver),
);
