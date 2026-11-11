import { defineService } from "../../core-client.js";
import { SystemService } from "./system.js";

/** Returns the client's SystemService, creating it on first use. */
export const systemService = defineService((context) => new SystemService(context.transports));
