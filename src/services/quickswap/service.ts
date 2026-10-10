import { defineService } from "../../core-client.js";
import { PolyesterServerCore } from "../../server-core.js";
import { ConfigurationError } from "../../shared/errors.js";
import { QuickSwapService } from "./quickswap.js";

const quickSwapAccessor = defineService((context) => new QuickSwapService(context.transports));

/**
 * Returns the server client's QuickSwapService, creating it on first use. Only
 * server cores accept it: the broker API key it needs must never reach a browser.
 */
export function quickSwapService(client: PolyesterServerCore): QuickSwapService {
    if (!(client instanceof PolyesterServerCore)) {
        throw new ConfigurationError("QuickSwap is only available on server clients.");
    }
    return quickSwapAccessor(client);
}
