import { defineService } from "../../core-client.js";
import { SocialVerificationService } from "./social-verification.js";

/** Returns the client's SocialVerificationService, creating it on first use. */
export const socialVerificationService = defineService(
    (context) => new SocialVerificationService(context.transports),
);
