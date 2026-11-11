import { defineService } from "../../core-client.js";
import { AssistantService } from "./assistant.js";

/** Returns the client's AssistantService, creating it on first use. */
export const assistantService = defineService(
    (context) => new AssistantService(context.transports, context.scales),
);
