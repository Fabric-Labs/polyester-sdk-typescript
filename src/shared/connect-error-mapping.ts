import { Code, ConnectError, type Interceptor, type Transport } from "@connectrpc/connect";
import { parseConnectErrorDetail, type PolyesterErrorDetail } from "./error-detail.js";
import {
    AlreadyExistsError,
    AuthenticationError,
    InternalServerError,
    isAbortError,
    MfaEnrollmentRequiredError,
    MfaLastFactorRequiredError,
    MfaVerificationError,
    type MfaVerificationFailureReason,
    normalizeErrorMessage,
    PermissionError,
    PolicyInUseError,
    PolicyLockedError,
    PolicyScopeMismatchError,
    PolyesterError,
    type PolyesterErrorOptions,
    PreconditionFailedError,
    RateLimitError,
    ResourceNotFoundError,
    RevisionConflictError,
    ServiceUnavailableError,
    SessionElevationRequiredError,
    StaleQuoteError,
    StepUpRequiredError,
    TimeoutError,
    TransientError,
    ValidationError,
} from "./errors.js";
import type { RateLimitDetail } from "./rate-limit.schemas.js";

function hasTransientTransferError(detail: PolyesterErrorDetail | undefined): boolean {
    if (detail?.service === "withdraw") {
        return [
            "SERVICE_UNAVAILABLE",
            "SOURCE_SMART_ACCOUNT_UNAVAILABLE",
            "CAPITAL_VIEW_UNAVAILABLE",
            "CHAIN_METADATA_UNAVAILABLE",
            "FEE_UNAVAILABLE",
            "SUPPLY_UNAVAILABLE",
            "STEP_UP_UNAVAILABLE",
            "DESTINATION_VALIDATION_UNAVAILABLE",
            "ACCOUNT_SHARD_UNAVAILABLE",
        ].includes(detail.code);
    }
    if (detail?.service === "internal_transfer") {
        return [
            "SERVICE_UNAVAILABLE",
            "SMART_ACCOUNT_UNAVAILABLE",
            "STEP_UP_UNAVAILABLE",
            "CAPITAL_VIEW_UNAVAILABLE",
            "ACCOUNT_SHARD_UNAVAILABLE",
        ].includes(detail.code);
    }
    return false;
}

function safeRetryAfterMs(rateLimit: RateLimitDetail | undefined): number | undefined {
    if (rateLimit?.retryAfterMs === undefined) return undefined;
    const value = BigInt(rateLimit.retryAfterMs);
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
}

const HTTP_WEEKDAY = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
const HTTP_WEEKDAY_LONG = "(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)";
const HTTP_MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const HTTP_DATE_RE = new RegExp(
    `^(?:${HTTP_WEEKDAY}, \\d{2} ${HTTP_MONTH} \\d{4} \\d{2}:\\d{2}:\\d{2} GMT|${HTTP_WEEKDAY_LONG}, \\d{2}-${HTTP_MONTH}-\\d{2} \\d{2}:\\d{2}:\\d{2} GMT|${HTTP_WEEKDAY} ${HTTP_MONTH} {1,2}\\d{1,2} \\d{2}:\\d{2}:\\d{2} \\d{4})$`,
    "u",
);

/**
 * Returns the error message without the leading "[code] " prefix that
 * `ConnectError` prepends, e.g. "[invalid_argument] Insufficient funds."
 * becomes "Insufficient funds.".
 */
export function getNormalizedConnectMessage(err: unknown): string {
    const ce = ConnectError.from(err);
    const raw = ce.message ?? "";
    return normalizeErrorMessage(raw);
}

export type MfaErrorKind = "session-elevation" | "enrollment" | "step-up";

/**
 * Classifies an error as one of the MFA flows the backend can demand.
 * Classification is based only on stable structured auth error details.
 */
export function detectMfaErrorKind(err: unknown): MfaErrorKind | null {
    const mapped = toPolyesterError(err);
    return mfaErrorKind(mapped instanceof PolyesterError ? mapped.detail : undefined);
}

function mfaErrorKind(detail: PolyesterErrorDetail | undefined): MfaErrorKind | null {
    if (detail?.service === "auth" && detail.code === "AUTH_MFA_ELEVATION_REQUIRED") {
        return "session-elevation";
    }
    if (detail?.service === "auth" && detail.code === "AUTH_STEP_UP_REQUIRED") return "step-up";
    if (detail?.service === "auth" && detail.code === "AUTH_MFA_NOT_ENROLLED") return "enrollment";
    return null;
}

function parseRetryAfterMs(ce: ConnectError): number | undefined {
    const value = ce.metadata.get("retry-after");
    if (!value) return undefined;
    if (/^\d+$/u.test(value)) {
        const seconds = BigInt(value);
        const maxSafeSeconds = BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 1000));
        return seconds <= maxSafeSeconds ? Number(seconds) * 1000 : undefined;
    }
    if (!HTTP_DATE_RE.test(value)) return undefined;
    const date = Date.parse(value);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    return undefined;
}

const MFA_ERROR_CLASSES = {
    "session-elevation": SessionElevationRequiredError,
    enrollment: MfaEnrollmentRequiredError,
    "step-up": StepUpRequiredError,
} as const;

/**
 * Maps a `ConnectError` from the Polyester backend onto the typed
 * {@link PolyesterError} tree. The original error is preserved as `cause`.
 */
export function connectErrorToPolyesterError(ce: ConnectError): PolyesterError {
    const message = getNormalizedConnectMessage(ce);
    const detail = parseConnectErrorDetail(ce);
    const options: PolyesterErrorOptions = { cause: ce, detail };
    const withFallback = (fallback: string) => message || fallback;

    if (detail?.service === "auth" && detail.code === "AUTH_RESOURCE_NOT_FOUND") {
        return new ResourceNotFoundError(withFallback("Resource not found."), options);
    }

    if (detail?.service === "auth" && detail.code === "AUTH_REVISION_CONFLICT") {
        return new RevisionConflictError(
            withFallback("Resource changed since it was last read."),
            options,
        );
    }

    if (detail?.service === "auth" && detail.code === "AUTH_POLICY_IN_USE") {
        return new PolicyInUseError(withFallback("Policy is still in use."), options);
    }
    if (detail?.service === "auth" && detail.code === "AUTH_POLICY_LOCKED") {
        return new PolicyLockedError(withFallback("Policy is locked."), options);
    }
    if (detail?.service === "auth" && detail.code === "AUTH_POLICY_SCOPE_MISMATCH") {
        return new PolicyScopeMismatchError(
            withFallback("Policy does not belong to the target account scope."),
            options,
        );
    }
    if (detail?.service === "auth" && detail.code === "AUTH_MFA_LAST_FACTOR_REQUIRED") {
        return new MfaLastFactorRequiredError(
            withFallback("At least one active MFA factor must remain enrolled."),
            options,
        );
    }
    if (detail?.service === "auth" && detail.code === "AUTH_INTERNAL_ERROR") {
        return new InternalServerError(withFallback("Internal server error."), options);
    }

    const mfaVerificationReason = getMfaVerificationFailureReason(detail);
    if (mfaVerificationReason) {
        return new MfaVerificationError(
            withFallback("MFA verification failed."),
            mfaVerificationReason,
            options,
        );
    }

    const mfaKind = mfaErrorKind(detail);
    if (mfaKind) {
        return new MFA_ERROR_CLASSES[mfaKind](
            withFallback("Multi-factor authentication required."),
            options,
        );
    }

    if (detail?.service === "orders" && detail.code === "STALE_QUOTE") {
        return new StaleQuoteError(withFallback("The submitted market quote is stale."), options);
    }

    const rateLimit = detail?.service === "orders" ? detail.rateLimit : undefined;
    if (
        rateLimit ||
        ((detail?.service === "orders" ||
            detail?.service === "withdraw" ||
            detail?.service === "internal_transfer") &&
            detail.code === "RATE_LIMIT_EXCEEDED")
    ) {
        return new RateLimitError(withFallback("Rate limit exceeded."), {
            ...options,
            rateLimit,
            retryAfterMs: safeRetryAfterMs(rateLimit) ?? parseRetryAfterMs(ce),
        });
    }

    if (hasTransientTransferError(detail)) {
        return new ServiceUnavailableError(withFallback("Service unavailable."), options);
    }

    switch (ce.code) {
        case Code.InvalidArgument:
        case Code.OutOfRange:
            return new ValidationError(withFallback("Invalid request."), options);
        case Code.NotFound:
            return new ResourceNotFoundError(withFallback("Resource not found."), options);
        case Code.AlreadyExists:
            return new AlreadyExistsError(withFallback("Resource already exists."), options);
        case Code.PermissionDenied:
            return new PermissionError(withFallback("Permission denied."), options);
        case Code.Unauthenticated:
            return new AuthenticationError(withFallback("Authentication required."), options);
        case Code.FailedPrecondition:
            return new PreconditionFailedError(withFallback("Precondition failed."), options);
        case Code.ResourceExhausted:
            return new RateLimitError(withFallback("Rate limit exceeded."), {
                ...options,
                retryAfterMs: parseRetryAfterMs(ce),
            });
        case Code.DeadlineExceeded:
            return new TimeoutError(withFallback("Request timed out."), options);
        case Code.Unavailable:
            return new ServiceUnavailableError(withFallback("Service unavailable."), options);
        case Code.Aborted:
            return new TransientError(withFallback("Operation aborted by the backend."), options);
        default:
            // Gateways sometimes surface outages as Unknown with this stock phrase.
            if (/service temporarily unavailable/i.test(message)) {
                return new ServiceUnavailableError(withFallback("Service unavailable."), options);
            }
            return new InternalServerError(withFallback("Internal server error."), options);
    }
}

function getMfaVerificationFailureReason(
    detail: PolyesterErrorDetail | undefined,
): MfaVerificationFailureReason | null {
    if (detail?.service === "auth" && detail.code === "AUTH_MFA_CHALLENGE_INVALID") {
        return "challenge-invalid";
    }
    if (detail?.service === "auth" && detail.code === "AUTH_MFA_CHALLENGE_LOCKED") {
        return "challenge-locked";
    }
    if (detail?.service === "auth" && detail.code === "AUTH_MFA_OTP_INVALID") return "otp-invalid";
    if (detail?.service === "auth" && detail.code === "AUTH_MFA_RECOVERY_INVALID") {
        return "recovery-code-invalid";
    }
    if (
        (detail?.service === "auth" && detail.code === "AUTH_MFA_PASSKEY_CREDENTIAL_INVALID") ||
        (detail?.service === "auth" && detail.code === "AUTH_MFA_PASSKEY_VERIFY_FAILED")
    ) {
        return "passkey-invalid";
    }

    return null;
}

function findPolyesterErrorInCauseChain(err: unknown): PolyesterError | null {
    let current: unknown = err;
    for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
        current = current.cause;
        if (current instanceof PolyesterError) return current;
    }
    return null;
}

/**
 * Converts any RPC-layer failure into its typed SDK error. Abort errors and
 * caller-cancelled requests pass through unchanged, as do errors that are
 * already typed (e.g. a `NetworkError` from the SDK fetch wrapper).
 */
export function toPolyesterError(err: unknown): unknown {
    if (err instanceof PolyesterError) return err;
    if (isAbortError(err)) return err;
    if (err instanceof ConnectError) {
        if (err.code === Code.Canceled) return err;
        const wrapped = findPolyesterErrorInCauseChain(err);
        if (wrapped) return wrapped;
        return connectErrorToPolyesterError(err);
    }
    return err;
}

async function* mapStreamErrors<T>(source: AsyncIterable<T>): AsyncIterable<T> {
    try {
        yield* source;
    } catch (err) {
        throw toPolyesterError(err);
    }
}

/**
 * Interceptor that converts every RPC failure (unary and streaming) into the
 * typed {@link PolyesterError} hierarchy. Installed outermost by
 * `createTransports`, so callers of SDK services always see typed errors.
 */
export function createErrorMappingInterceptor(): Interceptor {
    return (next) => async (req) => {
        try {
            const res = await next(req);
            if (res.stream) {
                return { ...res, message: mapStreamErrors(res.message) };
            }
            return res;
        } catch (err) {
            throw toPolyesterError(err);
        }
    };
}

/**
 * Wraps a Connect transport so errors are translated after Connect's call
 * runner has applied its own error normalization.
 */
export function createErrorMappingTransport(transport: Transport): Transport {
    return {
        async unary(method, signal, timeoutMs, header, input, contextValues) {
            try {
                return await transport.unary(
                    method,
                    signal,
                    timeoutMs,
                    header,
                    input,
                    contextValues,
                );
            } catch (error) {
                throw toPolyesterError(error);
            }
        },
        async stream(method, signal, timeoutMs, header, input, contextValues) {
            try {
                const response = await transport.stream(
                    method,
                    signal,
                    timeoutMs,
                    header,
                    input,
                    contextValues,
                );
                return { ...response, message: mapStreamErrors(response.message) };
            } catch (error) {
                throw toPolyesterError(error);
            }
        },
    };
}
