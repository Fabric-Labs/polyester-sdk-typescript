import { defineService } from "../../core-client.js";
import { PriceAlertsService } from "./price-alerts.js";

/** Returns the client's PriceAlertsService, creating it on first use. */
export const priceAlertsService = defineService(
    (context) => new PriceAlertsService(context.transports),
);
