import { defineService } from "../../core-client.js";
import { InternalTransfersService } from "./internal-transfers.js";

/** Returns the client's InternalTransfersService, creating it on first use. */
export const internalTransfersService = defineService(
    (context) => new InternalTransfersService(context.transports, context.resolver, context.scales),
);
