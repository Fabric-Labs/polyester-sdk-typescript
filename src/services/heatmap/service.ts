import { defineService } from "../../core-client.js";
import { HeatmapService } from "./heatmap.js";

/** Returns the client's HeatmapService, creating it on first use. */
export const heatmapService = defineService(
    (context) => new HeatmapService(context.transports, context.realtime, context.scales),
);
