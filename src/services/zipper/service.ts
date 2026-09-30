import { defineService } from "../../core-client.js";
import { ZipperService } from "./zipper.js";

/** Returns the client's ZipperService, creating it on first use. */
export const zipperService = defineService(
    (context) => new ZipperService(context.transports, context.realtime, context.scales),
);
