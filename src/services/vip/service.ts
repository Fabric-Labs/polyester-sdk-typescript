import { defineService } from "../../core-client.js";
import { VipService } from "./vip.js";

/** Returns the client's VipService, creating it on first use. */
export const vipService = defineService((context) => new VipService(context.transports));
