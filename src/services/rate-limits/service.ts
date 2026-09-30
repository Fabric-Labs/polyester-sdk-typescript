import { defineService } from "../../core-client.js";
import { RateLimitService } from "./rate-limits.js";

/** Returns the client's RateLimitService, creating it on first use. */
export const tradingRateLimitsService = defineService(
    (context) => new RateLimitService(context.transports, context.resolver),
);
