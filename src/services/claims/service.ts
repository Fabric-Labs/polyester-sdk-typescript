import { defineService } from "../../core-client.js";
import { ClaimsService } from "./claims.js";

/** Returns the client's ClaimsService, creating it on first use. */
export const claimsService = defineService((context) => new ClaimsService(context.transports));
