import { defineService } from "../../core-client.js";
import { StatementExportsService } from "./statement-exports.js";

/** Returns the client's StatementExportsService, creating it on first use. */
export const statementExportsService = defineService(
    (context) => new StatementExportsService(context.transports, context.resolver),
);
