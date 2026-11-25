import { defineService } from "../../core-client.js";
import { SwapService } from "./swap.js";

/** Returns the client's SwapService, creating it on first use. */
export const swapService = defineService(
    (context) => new SwapService(context.transports, context.resolver),
);
export {
    SWAP_TWAP_MAX_DURATION_MS,
    SWAP_TWAP_MIN_DURATION_MS,
    SWAP_TWAP_MIN_SLICE_INTERVAL_MS,
} from "./swap.constants.js";
