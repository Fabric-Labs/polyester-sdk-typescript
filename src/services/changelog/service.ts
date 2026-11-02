import { defineService } from "../../core-client.js";
import { ChangelogService } from "./changelog.js";

/** Returns the client's ChangelogService, creating it on first use. */
export const changelogService = defineService(
    (context) => new ChangelogService(context.transports),
);
