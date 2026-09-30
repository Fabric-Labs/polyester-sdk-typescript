import { defineService } from "../../core-client.js";
import { AccountsService } from "./accounts.js";

/** Returns the client's AccountsService, creating it on first use. */
export const accountsService = defineService((context) => new AccountsService(context.transports));
