import { defineService } from "../../core-client.js";
import type { PolyesterServerCore } from "../../server-core.js";
import { QuickSwapService } from "./quickswap.js";

/**
 * Returns the server client's QuickSwapService, creating it on first use. Typed
 * to server cores only: the broker API key it needs must never reach a browser.
 */
export const quickSwapService: (client: PolyesterServerCore) => QuickSwapService = defineService(
    (context) => new QuickSwapService(context.transports),
);
