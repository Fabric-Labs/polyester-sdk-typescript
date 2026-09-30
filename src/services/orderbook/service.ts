import { defineService } from "../../core-client.js";
import { OrderbookService } from "./orderbook.js";

/** Returns the client's OrderbookService, creating it on first use. */
export const orderbookService = defineService(
    (context) => new OrderbookService(context.transports, context.realtime, context.scales),
);
