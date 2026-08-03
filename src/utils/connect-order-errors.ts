import { toPolyesterError } from "../shared/connect-error-mapping.js";
import { StaleQuoteError } from "../shared/errors.js";

/**
 * True when an order mutation was rejected because its client reference quote
 * exceeded the backend's configured drift limit.
 */
export function isStaleQuoteError(error: unknown): boolean {
    let current = error;

    for (let depth = 0; depth < 5; depth += 1) {
        if (toPolyesterError(current) instanceof StaleQuoteError) return true;
        if (!(current instanceof Error) || current.cause === undefined) return false;
        current = current.cause;
    }

    return false;
}
