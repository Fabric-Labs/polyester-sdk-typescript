import { defineService } from "../../core-client.js";
import { TransfersService } from "./transfers.js";

/** Returns the client's TransfersService, creating it on first use. */
export const transfersService = defineService(
    (context) => new TransfersService(context.transports, context.realtime, context.resolver),
);
