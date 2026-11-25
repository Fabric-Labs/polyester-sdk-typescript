import { defineService } from "../../core-client.js";
import { AutoWithdrawService } from "./auto-withdraw.js";

/** Returns the client's AutoWithdrawService, creating it on first use. */
export const autoWithdrawService = defineService(
    (context) => new AutoWithdrawService(context.transports, context.resolver),
);
export {
    AUTO_WITHDRAW_CONVERSION_TWAP_DEFAULT_DURATION_MS,
    AUTO_WITHDRAW_CONVERSION_TWAP_MAX_DURATION_MS,
    AUTO_WITHDRAW_CONVERSION_TWAP_MIN_DURATION_MS,
} from "./auto-withdraw.constants.js";
