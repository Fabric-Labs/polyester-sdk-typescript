import { defineService } from "../../core-client.js";
import { MfaService } from "./mfa.js";

/** Returns the client's MfaService, creating it on first use. */
export const mfaService = defineService((context) => new MfaService(context.transports));
