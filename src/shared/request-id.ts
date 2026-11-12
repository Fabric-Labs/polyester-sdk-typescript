import { ConfigurationError } from "./errors.js";

/** Generates an idempotency key for a mutation whose caller supplied none: a UUID, or 32 hex digits without `randomUUID`. */
export function createMutationRequestId(): string {
    const crypto = globalThis.crypto;
    if (crypto?.randomUUID) return crypto.randomUUID();

    if (crypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    throw new ConfigurationError(
        "Secure request ID generation requires crypto.randomUUID or crypto.getRandomValues.",
    );
}
