import { defineService } from "../../core-client.js";
import { CheckpointsService } from "./checkpoints.js";

/** Returns the client's CheckpointsService, creating it on first use. */
export const checkpointsService = defineService(
    (context) => new CheckpointsService(context.transports),
);
