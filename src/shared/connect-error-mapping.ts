import { Code, ConnectError, type Interceptor, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { AuthErrorCode, AuthErrorDetailSchema } from "../gen/auth/v1/auth_pb.js";
import {
    ErrorCode as OrderErrorCode,
    ErrorDetailSchema as OrderErrorDetailSchema,
} from "../gen/orders/v1/orders_pb.js";
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
import { RateLimitDetailSchema, type RateLimitDetail } from "./rate-limit.schemas.js";

function getAuthErrorDetails(err: unknown) {
    return ConnectError.from(err).findDetails(AuthErrorDetailSchema);
}

function hasAuthErrorCode(err: unknown, code: AuthErrorCode): boolean {
    return getAuthErrorDetails(err).some((detail) => detail.code === code);
}

function hasOrderErrorCode(err: unknown, code: OrderErrorCode): boolean {
    return getOrderErrorDetails(err).some((detail) => detail.code === code);
}

function getOrderErrorDetails(err: unknown) {
    return ConnectError.from(err).findDetails(OrderErrorDetailSchema);
}

function getRateLimitDetail(err: unknown): RateLimitDetail | undefined {
    for (const orderDetail of getOrderErrorDetails(err)) {
        if (!orderDetail.rateLimit) continue;
        const result = v.safeParse(RateLimitDetailSchema, orderDetail.rateLimit);
        if (result.success) return result.output;
    }
    return undefined;
}

function safeRetryAfterMs(rateLimit: RateLimitDetail | undefined): number | undefined {
    if (rateLimit?.retryAfterMs === undefined) return undefined;
    const value = BigInt(rateLimit.retryAfterMs);
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
}

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
    if (hasAuthErrorCode(err, AuthErrorCode.AUTH_MFA_ELEVATION_REQUIRED)) {
        return "session-elevation";
    }
    if (hasAuthErrorCode(err, AuthErrorCode.AUTH_STEP_UP_REQUIRED)) return "step-up";
    if (hasAuthErrorCode(err, AuthErrorCode.AUTH_MFA_NOT_ENROLLED)) return "enrollment";
    return null;
}

function parseRetryAfterMs(ce: ConnectError): number | undefined {
    const value = ce.metadata.get("retry-after");
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
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
    const options: PolyesterErrorOptions = { cause: ce };
    const withFallback = (fallback: string) => message || fallback;

    if (hasAuthErrorCode(ce, AuthErrorCode.AUTH_RESOURCE_NOT_FOUND)) {
        return new ResourceNotFoundError(withFallback("Resource not found."), options);
    }

    if (hasAuthErrorCode(ce, AuthErrorCode.AUTH_REVISION_CONFLICT)) {
        return new RevisionConflictError(
            withFallback("Resource changed since it was last read."),
            options,
        );
    }

    if (hasAuthErrorCode(ce, AuthErrorCode.AUTH_POLICY_IN_USE)) {
        return new PolicyInUseError(withFallback("Policy is still in use."), options);
    }
    if (hasAuthErrorCode(ce, AuthErrorCode.AUTH_POLICY_LOCKED)) {
        return new PolicyLockedError(withFallback("Policy is locked."), options);
    }
    if (hasAuthErrorCode(ce, AuthErrorCode.AUTH_POLICY_SCOPE_MISMATCH)) {
        return new PolicyScopeMismatchError(
            withFallback("Policy does not belong to the target account scope."),
            options,
        );
    }
    if (hasAuthErrorCode(ce, AuthErrorCode.AUTH_MFA_LAST_FACTOR_REQUIRED)) {
        return new MfaLastFactorRequiredError(
            withFallback("At least one active MFA factor must remain enrolled."),
            options,
        );
    }

    const mfaVerificationReason = getMfaVerificationFailureReason(ce);
    if (mfaVerificationReason) {
        return new MfaVerificationError(
            withFallback("MFA verification failed."),
            mfaVerificationReason,
            options,
        );
    }

    const mfaKind = detectMfaErrorKind(ce);
    if (mfaKind) {
        return new MFA_ERROR_CLASSES[mfaKind](
            withFallback("Multi-factor authentication required."),
            options,
        );
    }

    if (hasOrderErrorCode(ce, OrderErrorCode.STALE_QUOTE)) {
        return new StaleQuoteError(withFallback("The submitted market quote is stale."), options);
    }

    const rateLimit = getRateLimitDetail(ce);
    if (rateLimit || hasOrderErrorCode(ce, OrderErrorCode.RATE_LIMIT_EXCEEDED)) {
        return new RateLimitError(withFallback("Rate limit exceeded."), {
            ...options,
            rateLimit,
            retryAfterMs: safeRetryAfterMs(rateLimit) ?? parseRetryAfterMs(ce),
        });
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

function getMfaVerificationFailureReason(err: unknown): MfaVerificationFailureReason | null {
    if (hasAuthErrorCode(err, AuthErrorCode.AUTH_MFA_CHALLENGE_INVALID)) {
        return "challenge-invalid";
    }
    if (hasAuthErrorCode(err, AuthErrorCode.AUTH_MFA_CHALLENGE_LOCKED)) {
        return "challenge-locked";
    }
    if (hasAuthErrorCode(err, AuthErrorCode.AUTH_MFA_OTP_INVALID)) return "otp-invalid";
    if (hasAuthErrorCode(err, AuthErrorCode.AUTH_MFA_RECOVERY_INVALID)) {
        return "recovery-code-invalid";
    }
    if (
        hasAuthErrorCode(err, AuthErrorCode.AUTH_MFA_PASSKEY_CREDENTIAL_INVALID) ||
        hasAuthErrorCode(err, AuthErrorCode.AUTH_MFA_PASSKEY_VERIFY_FAILED)
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
