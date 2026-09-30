import { defineService } from "../../core-client.js";
import { FeesService } from "./fees.js";

/** Returns the client's FeesService, creating it on first use. */
export const feesService = defineService(
    (context) => new FeesService(context.transports, context.resolver),
);
