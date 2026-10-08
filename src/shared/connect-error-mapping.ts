import { Code, ConnectError, type Interceptor, type Transport } from "@connectrpc/connect";
import {
    loadErrorDetailDecoders,
    parseConnectErrorDetail,
    type PolyesterErrorDetail,
} from "./error-detail.js";
import {
    AlreadyExistsError,
    AuthenticationError,
    errorFromHttpStatus,
    InternalServerError,
    NotImplementedError,
    isAbortError,
    isTimeoutAbortError,
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
    SubaccountChallengeInvalidError,
    StepUpRequiredError,
    TimeoutError,
    TimestampSkewError,
    TransientError,
    ValidationError,
    WithdrawDeadlineExpiredError,
} from "./errors.js";
import type { RateLimitDetail } from "./rate-limit.schemas.js";

/** Backend code for API-key signatures whose timestamp is outside the skew window. */
export const TIMESTAMP_SKEW_CODE = "TIMESTAMP_SKEW";

// The withdraw service has no structured code for this; match its message.
const WITHDRAW_DEADLINE_EXPIRED_MESSAGE = "deadline_ts_sec has expired";

function hasTransientServiceError(detail: PolyesterErrorDetail | undefined): boolean {
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
    if (detail?.service === "claims") {
        return ["SERVICE_UNAVAILABLE", "CLAIM_TEMPORARILY_UNAVAILABLE"].includes(detail.code);
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

/** Correlation fields read from response headers, for {@link PolyesterError}. */
export function responseCorrelation(
    headers: Headers,
): Pick<PolyesterErrorOptions, "requestId" | "cfRay" | "polyesterEdge"> {
    const cfRay = headers.get("cf-ray") ?? undefined;
    return {
        requestId: headers.get("x-request-id") ?? cfRay,
        cfRay,
        polyesterEdge: headers.get("x-polyester-edge") ?? undefined,
    };
}

// Client-side failures (timeouts, fetch errors, aborts) carry no response metadata.
function hasResponseMetadata(ce: ConnectError): boolean {
    return !ce.metadata.keys().next().done;
}

// HTTP status Connect servers send for each error code
// (https://connectrpc.com/docs/protocol#error-codes). Connect's own
// codeToHttpStatus is internal and outside its semver.
const CONNECT_CODE_HTTP_STATUS: Record<Code, number> = {
    [Code.Canceled]: 499,
    [Code.Unknown]: 500,
    [Code.InvalidArgument]: 400,
    [Code.DeadlineExceeded]: 504,
    [Code.NotFound]: 404,
    [Code.AlreadyExists]: 409,
    [Code.PermissionDenied]: 403,
    [Code.ResourceExhausted]: 429,
    [Code.FailedPrecondition]: 400,
    [Code.Aborted]: 409,
    [Code.OutOfRange]: 400,
    [Code.Unimplemented]: 501,
    [Code.Internal]: 500,
    [Code.Unavailable]: 503,
    [Code.DataLoss]: 500,
    [Code.Unauthenticated]: 401,
};

function responseStatusFromCode(ce: ConnectError): number | undefined {
    return hasResponseMetadata(ce) ? CONNECT_CODE_HTTP_STATUS[ce.code] : undefined;
}

// Runtimes word AbortSignal.timeout() reasons differently ("signal timed out",
// "The operation timed out.", "The operation was aborted due to timeout"), and
// ConnectError.from keeps only the message. Only matched on client-side cancels,
// so a server-sent `canceled` mentioning a timeout passes through.
const TIMEOUT_ABORT_MESSAGE_RE = /timed out|due to timeout/iu;

/**
 * Maps a `ConnectError` from the Polyester backend onto the typed
 * {@link PolyesterError} tree. The original error is preserved as `cause`.
 */
export function connectErrorToPolyesterError(ce: ConnectError): PolyesterError {
    const message = getNormalizedConnectMessage(ce);
    const detail = parseConnectErrorDetail(ce);
    const httpStatus = /^HTTP (\d{3})$/u.exec(ce.rawMessage)?.[1];
    const options: PolyesterErrorOptions = {
        cause: ce,
        detail,
        status: httpStatus ? Number(httpStatus) : responseStatusFromCode(ce),
        ...responseCorrelation(ce.metadata),
    };
    const withFallback = (fallback: string) => message || fallback;

    if (ce.rawMessage === TIMESTAMP_SKEW_CODE) {
        return new TimestampSkewError(
            "API key timestamp is outside the allowed skew window.",
            options,
        );
    }

    if (ce.code === Code.InvalidArgument && ce.rawMessage === WITHDRAW_DEADLINE_EXPIRED_MESSAGE) {
        return new WithdrawDeadlineExpiredError(
            "Withdraw signature deadline has passed. Prepare the withdraw again.",
            options,
        );
    }

    // Connect reports non-Connect HTTP error bodies as "HTTP <status>" with a lossy
    // code (e.g. 501 → Unknown), so map the real status. Bare 404 keeps Connect's
    // Unimplemented: it means the route is missing, not the resource.
    if (!detail && httpStatus && httpStatus !== "404") {
        return errorFromHttpStatus(Number(httpStatus), message, {
            ...options,
            retryAfterMs: parseRetryAfterMs(ce),
        });
    }

    if (detail?.service === "auth" && detail.code === "AUTH_RESOURCE_NOT_FOUND") {
        return new ResourceNotFoundError(withFallback("Resource not found."), options);
    }

    if (detail?.service === "auth" && detail.code === "AUTH_REVISION_CONFLICT") {
        return new RevisionConflictError(
            withFallback("Resource changed since it was last read."),
            options,
        );
    }

    if (detail?.service === "auth" && detail.code === "AUTH_SUBACCOUNT_CHALLENGE_INVALID") {
        return new SubaccountChallengeInvalidError(
            withFallback("Subaccount challenge is expired, replaced, or invalid."),
            options,
        );
    }
    if (detail?.service === "auth" && detail.code === "AUTH_SOCIAL_ACCOUNT_ALREADY_LINKED") {
        return new AlreadyExistsError(
            withFallback("Social account is already linked to another Polyester account."),
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
            detail?.service === "internal_transfer" ||
            detail?.service === "claims") &&
            detail.code === "RATE_LIMIT_EXCEEDED")
    ) {
        return new RateLimitError(withFallback("Rate limit exceeded."), {
            ...options,
            rateLimit,
            retryAfterMs: safeRetryAfterMs(rateLimit) ?? parseRetryAfterMs(ce),
        });
    }

    if (hasTransientServiceError(detail)) {
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
        case Code.Unimplemented:
            return new NotImplementedError(withFallback("Operation not implemented."), options);
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
 * `AbortSignal.timeout()` expiries become {@link TimeoutError}, whether the
 * timeout signal was passed by the caller or added by an interceptor. Prefer the
 * `timeoutMs` request option, which Connect reports as `DeadlineExceeded`.
 */
export function toPolyesterError(err: unknown): unknown {
    if (err instanceof PolyesterError) return err;
    if (isTimeoutAbortError(err)) return new TimeoutError("Request timed out.", { cause: err });
    if (isAbortError(err)) return err;
    if (err instanceof ConnectError) {
        if (err.code === Code.Canceled) {
            return !hasResponseMetadata(err) && TIMEOUT_ABORT_MESSAGE_RE.test(err.rawMessage)
                ? new TimeoutError("Request timed out.", { cause: err })
                : err;
        }
        const wrapped = findPolyesterErrorInCauseChain(err);
        if (wrapped) return wrapped;
        return connectErrorToPolyesterError(err);
    }
    return err;
}

function callerAbortError(signal: AbortSignal): DOMException | TimeoutError {
    const reason: unknown = signal.reason;
    if (isTimeoutAbortError(reason))
        return new TimeoutError("Request timed out.", { cause: reason });
    return preAbortedError(signal);
}

// A signal that fired before the call started is a cancellation even when it was
// a timeout: a retryable TimeoutError would let retry loops spin on a dead signal.
function preAbortedError(signal: AbortSignal): DOMException {
    const reason: unknown = signal.reason;
    return reason instanceof DOMException && reason.name === "AbortError"
        ? reason
        : new DOMException("Request canceled.", "AbortError");
}

async function toTransportError(err: unknown, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted && err instanceof ConnectError && err.code === Code.Canceled) {
        return callerAbortError(signal);
    }
    await loadErrorDetailDecoders(err);
    return toPolyesterError(err);
}

async function* mapStreamErrors<T>(
    source: AsyncIterable<T>,
    signal?: AbortSignal,
): AsyncIterable<T> {
    try {
        yield* source;
    } catch (err) {
        throw await toTransportError(err, signal);
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
            await loadErrorDetailDecoders(err);
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
            if (signal?.aborted) throw preAbortedError(signal);
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
                throw await toTransportError(error, signal);
            }
        },
        async stream(method, signal, timeoutMs, header, input, contextValues) {
            if (signal?.aborted) throw preAbortedError(signal);
            try {
                const response = await transport.stream(
                    method,
                    signal,
                    timeoutMs,
                    header,
                    input,
                    contextValues,
                );
                return { ...response, message: mapStreamErrors(response.message, signal) };
            } catch (error) {
                throw await toTransportError(error, signal);
            }
        },
    };
}
