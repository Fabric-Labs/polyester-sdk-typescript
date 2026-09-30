import { defineService } from "../../core-client.js";
import { OrdersService } from "./orders.js";

/** Returns the client's OrdersService, creating it on first use. */
export const ordersService = defineService(
    (context) =>
        new OrdersService(context.transports, context.realtime, context.resolver, context.scales),
);
