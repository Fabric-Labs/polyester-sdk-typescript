import { defineService } from "../../core-client.js";
import { DustConversionService } from "./dust-conversion.js";

/** Returns the client's DustConversionService, creating it on first use. */
export const dustConversionService = defineService(
    (context) => new DustConversionService(context.transports, context.resolver),
);
