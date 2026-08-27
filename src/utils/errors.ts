import { Code, ConnectError } from "@connectrpc/connect";
import { AuthErrorCode, AuthErrorDetailSchema } from "../gen/auth/v1/auth_pb.js";
import { getNormalizedConnectMessage, toPolyesterError } from "../shared/connect-error-mapping.js";
import {
    isAbortError,
    NetworkError,
    PolicyInUseError,
    PolicyLockedError,
    PolicyScopeMismatchError,
    PolyesterError,
    RateLimitError,
    ResourceNotFoundError,
    RevisionConflictError,
    ServiceUnavailableError,
    TimeoutError,
} from "../shared/errors.js";

function hasAuthErrorCode(err: unknown, code: AuthErrorCode): boolean {
    return ConnectError.from(err)
        .findDetails(AuthErrorDetailSchema)
        .some((detail) => detail.code === code);
}

/**
 * Unwraps a typed SDK error to the underlying `ConnectError` (kept as `cause`)
 * so legacy heuristics keep working on raw backend details.
 */
function unwrapCause(err: unknown): unknown {
    return err instanceof PolyesterError && err.cause !== undefined ? err.cause : err;
}

/**
 * Whether the backend signalled that the requested resource does not exist.
 * Prefer `err instanceof ResourceNotFoundError`; this predicate also covers
 * raw `ConnectError`s (NotFound or the auth resource-not-found detail).
 */
export function isResourceNotFoundError(err: unknown): boolean {
    // Connect can re-wrap interceptor errors as an Unknown ConnectError whose
    // cause is the typed SDK error. Normalize first to recover that cause.
    const mapped = toPolyesterError(err);
    if (mapped instanceof ResourceNotFoundError) return true;
    if (mapped instanceof PolyesterError && mapped.cause === undefined) return false;
    const target = unwrapCause(mapped);
    return (
        hasAuthErrorCode(target, AuthErrorCode.AUTH_RESOURCE_NOT_FOUND) ||
        ConnectError.from(target).code === Code.NotFound
    );
}

/** Whether an optimistic-concurrency update used a stale resource revision. */
export function isRevisionConflictError(err: unknown): boolean {
    const seen = new Set<unknown>();
    let current = err;
    while (current !== undefined && current !== null && !seen.has(current)) {
        seen.add(current);
        if (toPolyesterError(current) instanceof RevisionConflictError) return true;
        const connectError = ConnectError.from(current);
        if (
            (connectError.code === Code.Unknown || connectError.code === Code.Aborted) &&
            /\brevision conflict\b/i.test(getNormalizedConnectMessage(connectError))
        ) {
            return true;
        }
        current =
            typeof current === "object" && "cause" in current
                ? (current as { cause?: unknown }).cause
                : undefined;
    }
    return false;
}

/** Whether a policy mutation failed because the policy is still attached to a resource. */
export function isPolicyInUseError(err: unknown): boolean {
    return toPolyesterError(err) instanceof PolicyInUseError;
}

/** Whether a policy mutation failed because the policy is locked. */
export function isPolicyLockedError(err: unknown): boolean {
    return toPolyesterError(err) instanceof PolicyLockedError;
}

/** Whether the policy and target account belong to different scopes. */
export function isPolicyScopeMismatchError(err: unknown): boolean {
    return toPolyesterError(err) instanceof PolicyScopeMismatchError;
}

/**
 * Whether an error is retryable (network/timeout) for idempotent operations.
 * Uses same requestId on retry; backend dedupes within 2min.
 * Prefer `err instanceof TransientError` or `err.retryable` on typed errors.
 */
export function isRetryableError(err: unknown): boolean {
    if (isAbortError(err)) return false;
    const mapped = toPolyesterError(err);
    if (mapped instanceof PolyesterError) return mapped.retryable;
    const ce = ConnectError.from(mapped);
    return (
        ce.code === Code.Unavailable ||
        ce.code === Code.DeadlineExceeded ||
        ce.code === Code.ResourceExhausted ||
        ce.code === Code.Aborted
    );
}

/**
 * Diagnostic formatter for SDK and ConnectRPC errors.
 * Typed SDK errors already carry normalized messages; for raw ConnectErrors
 * this strips leading "[CODE]" prefixes. Falls back to a friendly default.
 * The returned message may contain backend implementation details. Never render
 * it to a user; use {@link formatUserFacingError} at presentation boundaries.
 * @param err - The error to format.
 * @param fallback - The fallback message when no message is available.
 * @returns The formatted error message.
 */
export function formatConnectError(
    err: unknown,
    fallback = "Request failed. Please try again.",
): string {
    if (err == null) return fallback;
    if (err instanceof PolyesterError) return err.message || fallback;
    const withoutCode = getNormalizedConnectMessage(err);
    return withoutCode || fallback;
}

/**
 * Formats an untrusted failure for direct display to a user.
 *
 * This function never returns an exception or backend message. A small allowlist
 * of typed transport conditions receives SDK-owned copy; every other failure
 * returns the caller-owned fallback.
 */
function userFacingTransportMessage(error: unknown): string | undefined {
    if (error instanceof RateLimitError) {
        return "You've made too many requests. Wait a moment and try again.";
    }
    if (error instanceof TimeoutError) return "This is taking longer than expected. Try again.";
    if (error instanceof ServiceUnavailableError) {
        return "This service is temporarily unavailable. Try again in a few minutes.";
    }
    if (error instanceof NetworkError) {
        return "We couldn't connect. Check your internet connection and try again.";
    }

    if (error instanceof ConnectError) {
        if (error.code === Code.ResourceExhausted) {
            return "You've made too many requests. Wait a moment and try again.";
        }
        if (error.code === Code.DeadlineExceeded) {
            return "This is taking longer than expected. Try again.";
        }
        if (error.code === Code.Unavailable) {
            return "This service is temporarily unavailable. Try again in a few minutes.";
        }
    }

    return undefined;
}

export function formatUserFacingError(error: unknown, fallback: string): string {
    // Walk the cause chain and normalize ConnectErrors so wrapped submit failures
    // (e.g. Error → ConnectError[unknown] "Service temporarily unavailable.")
    // still hit the transport allowlist.
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current != null; depth++) {
        const mapped = toPolyesterError(current);
        const fromMapped = userFacingTransportMessage(mapped);
        if (fromMapped !== undefined) return fromMapped;
        const fromCurrent = userFacingTransportMessage(current);
        if (fromCurrent !== undefined) return fromCurrent;

        current =
            typeof current === "object" && current !== null && "cause" in current
                ? (current as { cause?: unknown }).cause
                : undefined;
    }

    return fallback;
}
