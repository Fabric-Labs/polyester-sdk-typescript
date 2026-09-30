import { defineService } from "../../core-client.js";
import { AddressBookService } from "./address-book.js";

/** Returns the client's AddressBookService, creating it on first use. */
export const addressBookService = defineService(
    (context) => new AddressBookService(context.transports, context.realtime, context.resolver),
);
