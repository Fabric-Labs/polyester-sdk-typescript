import { defineService } from "../../core-client.js";
import { GuardSignerService } from "./guard-signer.js";

/** Returns the client's GuardSignerService, creating it on first use. */
export const guardSignerService = defineService(
    (context) => new GuardSignerService(context.transports, context.resolver),
);
