import { defineService } from "../../core-client.js";
import { WhiteboardService } from "./whiteboard.js";

/** Returns the client's WhiteboardService, creating it on first use. */
export const whiteboardService = defineService(
    (context) => new WhiteboardService(context.transports),
);
