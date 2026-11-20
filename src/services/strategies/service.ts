import { defineService } from "../../core-client.js";
import { StrategiesService } from "./strategies.js";

/** Returns the client's StrategiesService, creating it on first use. */
export const strategiesService = defineService(
    (context) => new StrategiesService(context.transports),
);
