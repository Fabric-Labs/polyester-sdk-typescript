import { defineService } from "../../core-client.js";
import { SwapService } from "./swap.js";

/** Returns the client's SwapService, creating it on first use. */
export const swapService = defineService(
    (context) => new SwapService(context.transports, context.resolver),
);
