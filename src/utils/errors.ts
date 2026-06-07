import { Code, ConnectError } from "@connectrpc/connect";
import { AuthErrorCode, AuthErrorDetailSchema } from "../gen/auth/v1/auth_pb.js";
import { isAbortError, TransportError } from "../shared/transports.js";

function getAuthErrorDetails(err: unknown) {
    return ConnectError.from(err).findDetails(AuthErrorDetailSchema);
}

function hasAuthErrorCode(err: unknown, code: AuthErrorCode): boolean {
    return getAuthErrorDetails(err).some((detail) => detail.code === code);
}

/**
 * Matches dashboard `isResourceNotFoundError`: backend signals no resource via NotFound or auth detail.
 */
export function isResourceNotFoundError(err: unknown): boolean {
    return (
        hasAuthErrorCode(err, AuthErrorCode.AUTH_RESOURCE_NOT_FOUND) ||
        ConnectError.from(err).code === Code.NotFound
    );
}

/**
 * Whether an error is retryable (network/timeout) for idempotent operations.
 * Uses same requestId on retry; backend dedupes within 2min.
 */
export function isRetryableError(err: unknown): boolean {
    if (isAbortError(err)) return false;
    if (err instanceof TransportError) return true;
    const ce = ConnectError.from(err);
    return ce.code === Code.Unavailable || ce.code === Code.DeadlineExceeded;
}

/**
 * Generic formatter for ConnectRPC errors.
 * Strips leading "[CODE]" prefixes and falls back to a friendly default.
 * @param err - The error to format.
 * @param fallback - The fallback message to return if the error is not a ConnectError.
 * @returns The formatted error message.
 */
export function formatConnectError(
    err: unknown,
    fallback = "Request failed. Please try again.",
): string {
    const ce = ConnectError.from(err);
    const raw = ce.message;
    // Strip leading "[CODE] " prefixes like "[invalid_argument] Insufficient funds."
    const match = raw.match(/^\[[^\]]*]\s*(.*)$/);
    const withoutCode = match && match[1] ? match[1] : raw;
    return withoutCode ?? fallback;
}
