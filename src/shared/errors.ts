import type { PolyesterErrorDetail } from "./error-detail.js";
export type { PolyesterErrorDetail } from "./error-detail.js";
import type { RateLimitDetail } from "./rate-limit.schemas.js";

/**
 * Typed error hierarchy for the Polyester SDK.
 *
 * Every error raised by the SDK extends {@link PolyesterError}, which carries a
 * stable machine-readable `code` and a `retryable` flag. The tree splits on
 * retryability so callers can triage with a single `instanceof` check:
 *
 * ```
 * PolyesterError                     code                        retryable
 * ├── TransientError                 TRANSIENT_FAILURE           true
 * │   ├── NetworkError               NETWORK_ERROR               true
 * │   ├── TimeoutError               TIMEOUT                     true
 * │   ├── RateLimitError             RATE_LIMITED                true
 * │   ├── TimestampSkewError         TIMESTAMP_SKEW              true
 * │   └── ServiceUnavailableError    SERVICE_UNAVAILABLE         true
 * ├── RequestError                   REQUEST_FAILED              false
 * │   ├── ValidationError            VALIDATION_FAILED           false
 * │   │   ├── StaleQuoteError            STALE_QUOTE
 * │   │   ├── WithdrawDeadlineExpiredError WITHDRAW_DEADLINE_EXPIRED
 * │   │   └── PolicyScopeMismatchError   POLICY_SCOPE_MISMATCH
 * │   ├── ResourceNotFoundError      RESOURCE_NOT_FOUND          false
 * │   ├── NotImplementedError        NOT_IMPLEMENTED             false
 * │   ├── AlreadyExistsError         ALREADY_EXISTS              false
 * │   │   └── UserOperationAlreadyKnownError USER_OPERATION_ALREADY_KNOWN
 * │   ├── PermissionError            PERMISSION_DENIED           false
 * │   ├── AuthenticationError        UNAUTHENTICATED             false
 * │   │   └── WalletChallengeExpiredError    WALLET_CHALLENGE_EXPIRED
 * │   ├── PreconditionFailedError    PRECONDITION_FAILED         false
 * │   │   ├── RevisionConflictError          REVISION_CONFLICT
 * │   │   ├── PolicyInUseError               POLICY_IN_USE
 * │   │   ├── PolicyLockedError              POLICY_LOCKED
 * │   │   ├── SubaccountChallengeInvalidError SUBACCOUNT_CHALLENGE_INVALID
 * │   │   └── MfaLastFactorRequiredError     MFA_LAST_FACTOR_REQUIRED
 * │   ├── ConfigurationError         INVALID_CONFIGURATION       false
 * │   ├── MfaRequiredError           MFA_REQUIRED                false
 * │   │   ├── MfaEnrollmentRequiredError     MFA_ENROLLMENT_REQUIRED
 * │   │   ├── StepUpRequiredError            STEP_UP_REQUIRED
 * │   │   └── SessionElevationRequiredError  SESSION_ELEVATION_REQUIRED
 * │   ├── MfaVerificationError       MFA_VERIFICATION_FAILED     false
 * │   └── UserOperationNotExecutedError USER_OPERATION_NOT_EXECUTED false
 * └── InternalServerError            INTERNAL_SERVER_ERROR       false
 * ```
 *
 * Catalog errors (`CatalogLookupError`, `CatalogConversionError`, …) plug into
 * the same tree under `RequestError`/`ValidationError`.
 *
 * Errors mapped from RPC failures keep the original `ConnectError` as `cause`
 * and carry the response's `status` and correlation headers when available.
 *
 * @example
 * ```ts
 * try {
 *   await client.orders.createSpotOrder(input);
 * } catch (err) {
 *   if (err instanceof RateLimitError) await sleep(err.retryAfterMs ?? 1000);
 *   else if (err instanceof TransientError) retry();
 *   else if (err instanceof StepUpRequiredError) promptForMfa();
 *   else throw err;
 * }
 * ```
 */

/** Stable machine-readable codes carried by built-in SDK errors. */
export type PolyesterErrorCode =
    | "TRANSIENT_FAILURE"
    | "NETWORK_ERROR"
    | "TIMEOUT"
    | "RATE_LIMITED"
    | "TIMESTAMP_SKEW"
    | "SERVICE_UNAVAILABLE"
    | "REQUEST_FAILED"
    | "VALIDATION_FAILED"
    | "STALE_QUOTE"
    | "WITHDRAW_DEADLINE_EXPIRED"
    | "RESOURCE_NOT_FOUND"
    | "NOT_IMPLEMENTED"
    | "ALREADY_EXISTS"
    | "USER_OPERATION_ALREADY_KNOWN"
    | "USER_OPERATION_NOT_EXECUTED"
    | "PERMISSION_DENIED"
    | "UNAUTHENTICATED"
    | "WALLET_CHALLENGE_EXPIRED"
    | "PRECONDITION_FAILED"
    | "REVISION_CONFLICT"
    | "POLICY_IN_USE"
    | "POLICY_LOCKED"
    | "POLICY_SCOPE_MISMATCH"
    | "INVALID_CONFIGURATION"
    | "MFA_REQUIRED"
    | "MFA_ENROLLMENT_REQUIRED"
    | "STEP_UP_REQUIRED"
    | "SESSION_ELEVATION_REQUIRED"
    | "MFA_LAST_FACTOR_REQUIRED"
    | "MFA_VERIFICATION_FAILED"
    | "INTERNAL_SERVER_ERROR"
    | "CATALOG_LOOKUP_MISS"
    | "CATALOG_NOT_READY"
    | "CATALOG_CONVERSION_INVALID"
    | "CATALOG_VALIDATION_FAILED";

export interface PolyesterErrorOptions {
    /** Underlying error, typically the original `ConnectError` for RPC failures. */
    cause?: unknown;
    /** Recognized structured backend rejection, decoded at the RPC boundary. */
    detail?: PolyesterErrorDetail;
    /** HTTP status of the failed response. */
    status?: number;
    /** Backend request ID (`x-request-id`), falling back to the Cloudflare `cf-ray` ID. */
    requestId?: string;
    /** Cloudflare `cf-ray` response header. */
    cfRay?: string;
    /** `x-polyester-edge` response header. */
    polyesterEdge?: string;
}

const CONNECT_ERROR_PREFIX_RE = /^(?:\[[a-z][a-z0-9_-]*]\s*)+/i;

export function normalizeErrorMessage(message: string): string {
    return message.replace(CONNECT_ERROR_PREFIX_RE, "").trim();
}

/**
 * Base class for every error raised by the Polyester SDK.
 *
 * Check `retryable` (or `instanceof TransientError`) to decide whether the
 * same call can be safely retried, and switch on `code` for exhaustive,
 * minification-safe handling.
 */
export abstract class PolyesterError extends Error {
    /** Stable machine-readable error code, e.g. `"RATE_LIMITED"`. */
    abstract readonly code: string;
    /** Whether retrying the same operation may succeed. */
    abstract readonly retryable: boolean;
    readonly detail: PolyesterErrorDetail | undefined;
    /**
     * HTTP status of the failed response. For Connect errors that carry no raw
     * HTTP status, the Connect protocol's status for the error code.
     */
    readonly status: number | undefined;
    /**
     * Correlation ID for support and logs: the backend `x-request-id`, falling
     * back to the Cloudflare `cf-ray` ID. Browsers only see these headers when
     * the API exposes them via CORS.
     */
    readonly requestId: string | undefined;
    /** Cloudflare `cf-ray` response header. */
    readonly cfRay: string | undefined;
    /** `x-polyester-edge` response header. */
    readonly polyesterEdge: string | undefined;

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(normalizeErrorMessage(message), options);
        this.name = "PolyesterError";
        const inherited = options?.cause instanceof PolyesterError ? options.cause : undefined;
        this.detail = options?.detail ?? inherited?.detail;
        this.status = options?.status ?? inherited?.status;
        this.requestId = options?.requestId ?? inherited?.requestId;
        this.cfRay = options?.cfRay ?? inherited?.cfRay;
        this.polyesterEdge = options?.polyesterEdge ?? inherited?.polyesterEdge;
    }
}

/**
 * A transient failure — the request may never have reached the backend or the
 * backend was temporarily unable to serve it. Follow the operation's retry
 * contract: reuse requestId for idempotent mutations. For single-order creation,
 * reconcile by clientOrderId; reusing it returns a conflict rather than replay.
 */
export class TransientError extends PolyesterError {
    readonly code: string = "TRANSIENT_FAILURE";
    readonly retryable = true;

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "TransientError";
    }
}

/** The request could not be sent or the connection failed mid-flight. */
export class NetworkError extends TransientError {
    override readonly code: string = "NETWORK_ERROR";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "NetworkError";
    }
}

/** The request timed out before the backend produced a response. */
export class TimeoutError extends TransientError {
    override readonly code: string = "TIMEOUT";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "TimeoutError";
    }
}

export interface RateLimitErrorOptions extends PolyesterErrorOptions {
    /** Suggested wait before retrying, when the backend provided one. */
    retryAfterMs?: number;
    /** Structured quota state attached to the rejection, when provided. */
    rateLimit?: RateLimitDetail;
}

/** The backend rejected the request due to rate limiting. */
export class RateLimitError extends TransientError {
    override readonly code: string = "RATE_LIMITED";
    /** Suggested wait before retrying, in milliseconds, when known. */
    readonly retryAfterMs?: number;
    /** Structured quota state attached to the rejection, when provided. */
    readonly rateLimit?: RateLimitDetail;

    constructor(message: string, options?: RateLimitErrorOptions) {
        super(message, options);
        this.name = "RateLimitError";
        this.retryAfterMs = options?.retryAfterMs;
        this.rateLimit = options?.rateLimit;
    }
}

/**
 * The API-key signature timestamp fell outside the backend's skew window, e.g.
 * because the request waited too long in the runtime's fetch queue during a
 * large concurrent burst, or the local clock drifted. Retrying the call signs
 * it again with a fresh timestamp; bound concurrency if it recurs.
 */
export class TimestampSkewError extends TransientError {
    override readonly code: string = "TIMESTAMP_SKEW";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "TimestampSkewError";
    }
}

/** The backend is temporarily unavailable (e.g. overloaded or restarting). */
export class ServiceUnavailableError extends TransientError {
    override readonly code: string = "SERVICE_UNAVAILABLE";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "ServiceUnavailableError";
    }
}

/**
 * The request itself was rejected — retrying the identical call will fail the
 * same way. Fix the input, authentication, or permissions first.
 */
export class RequestError extends PolyesterError {
    readonly code: string = "REQUEST_FAILED";
    readonly retryable = false;

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "RequestError";
    }
}

/** The request input failed validation (client- or server-side). */
export class ValidationError extends RequestError {
    override readonly code: string = "VALIDATION_FAILED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "ValidationError";
    }
}

/** The submitted client reference quote exceeded the market's configured drift limit. */
export class StaleQuoteError extends ValidationError {
    override readonly code = "STALE_QUOTE" as const;

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "StaleQuoteError";
    }
}

/**
 * The prepared withdraw's signed deadline has passed, so the backend would
 * reject it. Prepare (and sign) the withdraw again.
 *
 * Thrown by `submit` before sending once the deadline has passed, and when the
 * backend rejects the deadline as expired: one that lapsed in flight, or one
 * signed from a device clock running behind while the server clock was unknown.
 */
export class WithdrawDeadlineExpiredError extends ValidationError {
    override readonly code: string = "WITHDRAW_DEADLINE_EXPIRED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "WithdrawDeadlineExpiredError";
    }
}

/** The requested resource does not exist (or is not visible to the caller). */
export class ResourceNotFoundError extends RequestError {
    override readonly code: string = "RESOURCE_NOT_FOUND";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "ResourceNotFoundError";
    }
}

/** The backend does not implement the requested operation (HTTP 501 / Connect `unimplemented`). */
export class NotImplementedError extends RequestError {
    override readonly code: string = "NOT_IMPLEMENTED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "NotImplementedError";
    }
}

/** The resource already exists (e.g. a duplicate `clientOrderId`). */
export class AlreadyExistsError extends RequestError {
    override readonly code: string = "ALREADY_EXISTS";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "AlreadyExistsError";
    }
}

/**
 * The bundler already holds this exact UserOperation (it answered "Already
 * known"), so the earlier submission is still pending. Wait on `userOpHash`
 * instead of signing again; a new operation would execute a second time.
 */
export class UserOperationAlreadyKnownError extends AlreadyExistsError {
    override readonly code: string = "USER_OPERATION_ALREADY_KNOWN";
    readonly userOpHash: `0x${string}`;

    constructor(message: string, userOpHash: `0x${string}`, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "UserOperationAlreadyKnownError";
        this.userOpHash = userOpHash;
    }
}

/** The caller is authenticated but not allowed to perform this operation. */
export class PermissionError extends RequestError {
    override readonly code: string = "PERMISSION_DENIED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "PermissionError";
    }
}

/** The caller is not authenticated (missing, expired, or invalid credentials). */
export class AuthenticationError extends RequestError {
    override readonly code: string = "UNAUTHENTICATED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "AuthenticationError";
    }
}

/**
 * The signed wallet login challenge expired before it was submitted (challenges
 * last five minutes). Start the login again to request a fresh challenge.
 *
 * Client-side check only: the backend has no distinct code for an expired
 * challenge, so a rejection from the server is a plain {@link AuthenticationError}.
 */
export class WalletChallengeExpiredError extends AuthenticationError {
    override readonly code: string = "WALLET_CHALLENGE_EXPIRED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "WalletChallengeExpiredError";
    }
}

/** The system is not in a state that allows this operation (e.g. insufficient balance). */
export class PreconditionFailedError extends RequestError {
    override readonly code: string = "PRECONDITION_FAILED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "PreconditionFailedError";
    }
}

/**
 * The resource changed after it was read, so the submitted expected revision
 * is stale. Refetch and let the caller reconcile; do not blindly retry.
 */
export class RevisionConflictError extends PreconditionFailedError {
    override readonly code: string = "REVISION_CONFLICT";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "RevisionConflictError";
    }
}

/**
 * The subaccount authorization is expired, replaced by a newer challenge, replayed,
 * or otherwise invalid. Request a fresh challenge via `subaccounts.createChallenge`.
 */
export class SubaccountChallengeInvalidError extends PreconditionFailedError {
    override readonly code: string = "SUBACCOUNT_CHALLENGE_INVALID";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "SubaccountChallengeInvalidError";
    }
}

/** The policy cannot be removed while accounts or API keys still use it. */
export class PolicyInUseError extends PreconditionFailedError {
    override readonly code: string = "POLICY_IN_USE";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "PolicyInUseError";
    }
}

/** The policy is locked against the requested mutation. */
export class PolicyLockedError extends PreconditionFailedError {
    override readonly code: string = "POLICY_LOCKED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "PolicyLockedError";
    }
}

/** The policy does not belong to the account scope targeted by the request. */
export class PolicyScopeMismatchError extends ValidationError {
    override readonly code: string = "POLICY_SCOPE_MISMATCH";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "PolicyScopeMismatchError";
    }
}

/** The SDK was configured incorrectly (bad environment, missing credentials, …). */
export class ConfigurationError extends RequestError {
    override readonly code: string = "INVALID_CONFIGURATION";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "ConfigurationError";
    }
}

/**
 * The operation requires additional multi-factor authentication. Catch this
 * class to handle all MFA flows, or the subclasses to branch per flow.
 */
export class MfaRequiredError extends RequestError {
    override readonly code: string = "MFA_REQUIRED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "MfaRequiredError";
    }
}

/** The user must enroll in MFA before this operation can proceed. */
export class MfaEnrollmentRequiredError extends MfaRequiredError {
    override readonly code: string = "MFA_ENROLLMENT_REQUIRED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "MfaEnrollmentRequiredError";
    }
}

/** The operation requires a fresh MFA step-up proof (retry with `X-Auth-Step-Up`). */
export class StepUpRequiredError extends MfaRequiredError {
    override readonly code: string = "STEP_UP_REQUIRED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "StepUpRequiredError";
    }
}

/** The operation requires a recent MFA-elevated session, not a one-use step-up proof. */
export class SessionElevationRequiredError extends MfaRequiredError {
    override readonly code: string = "SESSION_ELEVATION_REQUIRED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "SessionElevationRequiredError";
    }
}

/** The requested deletion would leave the account without an active MFA factor. */
export class MfaLastFactorRequiredError extends PreconditionFailedError {
    override readonly code: string = "MFA_LAST_FACTOR_REQUIRED";

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "MfaLastFactorRequiredError";
    }
}

/** The reason an MFA challenge could not be completed. */
export type MfaVerificationFailureReason =
    | "challenge-invalid"
    | "challenge-locked"
    | "otp-invalid"
    | "recovery-code-invalid"
    | "passkey-invalid";

/**
 * An expected MFA verification rejection. Callers should select their own
 * user-facing copy from `reason` instead of displaying the backend message.
 */
export class MfaVerificationError extends RequestError {
    override readonly code: string = "MFA_VERIFICATION_FAILED";

    constructor(
        message: string,
        readonly reason: MfaVerificationFailureReason,
        options?: PolyesterErrorOptions,
    ) {
        super(message, options);
        this.name = "MfaVerificationError";
    }
}

/**
 * The backend failed unexpectedly or returned a malformed response. Not
 * automatically retryable — the failure may recur and mutations may have
 * partially applied.
 */
export class InternalServerError extends PolyesterError {
    readonly code: string = "INTERNAL_SERVER_ERROR";
    readonly retryable = false;

    constructor(message: string, options?: PolyesterErrorOptions) {
        super(message, options);
        this.name = "InternalServerError";
    }
}

/**
 * Checks whether an error represents an aborted request (caller-initiated via
 * `AbortSignal`). Aborts are intentionally NOT part of the {@link PolyesterError}
 * tree and are never retryable.
 */
export function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === "AbortError";
}

/** Checks whether an error is the `TimeoutError` raised by `AbortSignal.timeout()`. */
export function isTimeoutAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === "TimeoutError";
}

/** Maps a plain HTTP status code onto the SDK error tree. */
export function errorFromHttpStatus(
    status: number,
    message: string,
    options?: RateLimitErrorOptions,
): PolyesterError {
    if (status === 400 || status === 422) return new ValidationError(message, options);
    if (status === 401) return new AuthenticationError(message, options);
    if (status === 403) return new PermissionError(message, options);
    if (status === 404) return new ResourceNotFoundError(message, options);
    if (status === 408) return new TimeoutError(message, options);
    if (status === 409) return new AlreadyExistsError(message, options);
    if (status === 412) return new PreconditionFailedError(message, options);
    if (status === 429) return new RateLimitError(message, options);
    if (status === 501) return new NotImplementedError(message, options);
    if (status === 502 || status === 503 || status === 504) {
        return new ServiceUnavailableError(message, options);
    }
    if (status >= 500) return new InternalServerError(message, options);
    if (status >= 400) return new RequestError(message, options);
    return new NetworkError(message, options);
}

/**
 * The bundler reported a UserOperation as definitively not executed, so nothing
 * moved on chain: `rejected` (dropped by the bundler, often for a fee below the
 * current price) or `failed` (its bundle transaction reverted). Submitting a
 * fresh operation is safe.
 */
export class UserOperationNotExecutedError extends RequestError {
    override readonly code: string = "USER_OPERATION_NOT_EXECUTED";
    readonly userOpHash: `0x${string}`;
    /** The bundler's `pimlico_getUserOperationStatus` result. */
    readonly bundlerStatus: "rejected" | "failed";

    constructor(
        message: string,
        userOpHash: `0x${string}`,
        bundlerStatus: "rejected" | "failed",
        options?: PolyesterErrorOptions,
    ) {
        super(message, options);
        this.name = "UserOperationNotExecutedError";
        this.userOpHash = userOpHash;
        this.bundlerStatus = bundlerStatus;
    }
}
