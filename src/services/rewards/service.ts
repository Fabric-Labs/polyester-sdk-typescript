import { defineService } from "../../core-client.js";
import { RewardsService } from "./rewards.js";

/** Returns the client's RewardsService, creating it on first use. */
export const rewardsService = defineService((context) => new RewardsService(context.transports));
