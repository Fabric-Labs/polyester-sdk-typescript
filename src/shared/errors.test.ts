import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import {
    CatalogConversionError,
    CatalogLookupError,
    CatalogNotReadyError,
    CatalogValidationFailedError,
} from "../catalogs/types.js";
import { AuthErrorCode, AuthErrorDetailSchema } from "../gen/auth/v1/auth_pb.js";
import {
    ErrorCode as OrderErrorCode,
    ErrorDetailSchema as OrderErrorDetailSchema,
} from "../gen/orders/v1/orders_pb.js";
import {
    FailureReason,
    LimiterScope,
    PolicyClass,
    RateLimitDetailSchema,
    RefillModel,
} from "../gen/polyester/ratelimit/v1/types_pb.js";
import {
    isFreshStepUpRequiredError,
    isMfaEnrollmentRequiredError,
    isMfaLastFactorRequiredError,
    isSessionElevationRequiredError,
} from "../utils/connect-mfa-errors.js";
import {
    formatConnectError,
    formatUserFacingError,
    isPolicyInUseError,
    isPolicyLockedError,
    isPolicyScopeMismatchError,
    isResourceNotFoundError,
    isRevisionConflictError,
    isRetryableError,
} from "../utils/errors.js";
import {
    connectErrorToPolyesterError,
    detectMfaErrorKind,
    toPolyesterError,
} from "./connect-error-mapping.js";
import {
    AlreadyExistsError,
    AuthenticationError,
    ConfigurationError,
    errorFromHttpStatus,
    InternalServerError,
    MfaEnrollmentRequiredError,
    MfaLastFactorRequiredError,
    MfaRequiredError,
    MfaVerificationError,
    NetworkError,
    PermissionError,
    PolicyInUseError,
    PolicyLockedError,
    PolicyScopeMismatchError,
    PolyesterError,
    PreconditionFailedError,
    RateLimitError,
    RequestError,
    ResourceNotFoundError,
    RevisionConflictError,
    ServiceUnavailableError,
    SessionElevationRequiredError,
    StepUpRequiredError,
    TimeoutError,
    TransientError,
    ValidationError,
} from "./errors.js";

function authDetailError(message: string, code: Code, authCode: AuthErrorCode): ConnectError {
    return new ConnectError(message, code, undefined, [
        { desc: AuthErrorDetailSchema, value: create(AuthErrorDetailSchema, { code: authCode }) },
    ]);
}

describe("error hierarchy", () => {
    it("splits on retryability", () => {
        const transient = [
            new NetworkError("n"),
            new TimeoutError("t"),
            new RateLimitError("r"),
            new ServiceUnavailableError("s"),
        ];
        for (const err of transient) {
            expect(err).toBeInstanceOf(TransientError);
            expect(err).toBeInstanceOf(PolyesterError);
            expect(err.retryable).toBe(true);
        }

        const request = [
            new ValidationError("v"),
            new ResourceNotFoundError("n"),
            new AlreadyExistsError("a"),
            new PermissionError("p"),
            new AuthenticationError("a"),
            new PreconditionFailedError("p"),
            new RevisionConflictError("r"),
            new PolicyInUseError("p"),
            new PolicyLockedError("p"),
            new PolicyScopeMismatchError("p"),
            new ConfigurationError("c"),
            new MfaEnrollmentRequiredError("m"),
            new StepUpRequiredError("s"),
            new SessionElevationRequiredError("s"),
            new MfaLastFactorRequiredError("m"),
            new MfaVerificationError("v", "otp-invalid"),
        ];
        for (const err of request) {
            expect(err).toBeInstanceOf(RequestError);
            expect(err).toBeInstanceOf(PolyesterError);
            expect(err).not.toBeInstanceOf(TransientError);
            expect(err.retryable).toBe(false);
        }

        expect(new InternalServerError("i").retryable).toBe(false);
    });

    it("exposes stable codes and names", () => {
        expect(new RateLimitError("r").code).toBe("RATE_LIMITED");
        expect(new RateLimitError("r").name).toBe("RateLimitError");
        expect(new ValidationError("v").code).toBe("VALIDATION_FAILED");
        expect(new RevisionConflictError("r").code).toBe("REVISION_CONFLICT");
        expect(new RevisionConflictError("r").name).toBe("RevisionConflictError");
        expect(new PolicyInUseError("p").code).toBe("POLICY_IN_USE");
        expect(new PolicyLockedError("p").code).toBe("POLICY_LOCKED");
        expect(new PolicyScopeMismatchError("p").code).toBe("POLICY_SCOPE_MISMATCH");
        expect(new ConfigurationError("c").code).toBe("INVALID_CONFIGURATION");
        expect(new MfaVerificationError("m", "otp-invalid").code).toBe("MFA_VERIFICATION_FAILED");
    });

    it("groups MFA flows under MfaRequiredError", () => {
        expect(new MfaEnrollmentRequiredError("m")).toBeInstanceOf(MfaRequiredError);
        expect(new StepUpRequiredError("s")).toBeInstanceOf(MfaRequiredError);
        expect(new SessionElevationRequiredError("s")).toBeInstanceOf(MfaRequiredError);
    });

    it("keeps catalog errors in the tree", () => {
        expect(new CatalogLookupError("market", "pair", "BTC-USD")).toBeInstanceOf(RequestError);
        expect(new CatalogNotReadyError()).toBeInstanceOf(RequestError);
        expect(new CatalogConversionError("price", "bad")).toBeInstanceOf(ValidationError);
        expect(
            new CatalogValidationFailedError([{ field: "qty", rule: "min", message: "too small" }]),
        ).toBeInstanceOf(ValidationError);
        expect(new CatalogLookupError("market", "pair", "BTC-USD").retryable).toBe(false);
        expect(new CatalogLookupError("market", "pair", "BTC-USD").code).toBe(
            "CATALOG_LOOKUP_MISS",
        );
    });

    it("preserves the cause chain", () => {
        const cause = new TypeError("Failed to fetch");
        const err = new NetworkError("Transport request failed", { cause });
        expect(err.cause).toBe(cause);
    });

    it("normalizes Connect-style prefixes in typed SDK error messages", () => {
        expect(new ValidationError("[unknown] bad order").message).toBe("bad order");
        expect(new ValidationError("[UNKNOWN] [invalid-argument] bad order").message).toBe(
            "bad order",
        );
        expect(errorFromHttpStatus(400, "[invalid_argument] Insufficient funds.").message).toBe(
            "Insufficient funds.",
        );
    });
});

describe("connectErrorToPolyesterError", () => {
    const cases: Array<[Code, new (...args: never[]) => PolyesterError]> = [
        [Code.InvalidArgument, ValidationError],
        [Code.OutOfRange, ValidationError],
        [Code.NotFound, ResourceNotFoundError],
        [Code.AlreadyExists, AlreadyExistsError],
        [Code.PermissionDenied, PermissionError],
        [Code.Unauthenticated, AuthenticationError],
        [Code.FailedPrecondition, PreconditionFailedError],
        [Code.ResourceExhausted, RateLimitError],
        [Code.DeadlineExceeded, TimeoutError],
        [Code.Unavailable, ServiceUnavailableError],
        [Code.Aborted, TransientError],
        [Code.Internal, InternalServerError],
        [Code.Unknown, InternalServerError],
        [Code.Unimplemented, InternalServerError],
    ];

    it.each(cases)("maps gRPC code %s", (code, expected) => {
        const ce = new ConnectError("boom", code);
        const mapped = connectErrorToPolyesterError(ce);
        expect(mapped).toBeInstanceOf(expected);
        expect(mapped.cause).toBe(ce);
    });

    it("normalizes the [code] message prefix", () => {
        const ce = new ConnectError("Insufficient funds.", Code.InvalidArgument);
        expect(ce.message).toBe("[invalid_argument] Insufficient funds.");
        expect(connectErrorToPolyesterError(ce).message).toBe("Insufficient funds.");
    });

    it("falls back to a friendly message when the backend sends none", () => {
        const mapped = connectErrorToPolyesterError(new ConnectError("", Code.NotFound));
        expect(mapped.message).toBe("Resource not found.");
    });

    it("maps the auth resource-not-found detail regardless of gRPC code", () => {
        const ce = authDetailError(
            "gone",
            Code.PermissionDenied,
            AuthErrorCode.AUTH_RESOURCE_NOT_FOUND,
        );
        expect(connectErrorToPolyesterError(ce)).toBeInstanceOf(ResourceNotFoundError);
    });

    it("maps revision-conflict details before generic aborted handling", () => {
        const raw = authDetailError("", Code.Aborted, AuthErrorCode.AUTH_REVISION_CONFLICT);
        const mapped = connectErrorToPolyesterError(raw);

        expect(mapped).toBeInstanceOf(RevisionConflictError);
        expect(mapped).toBeInstanceOf(PreconditionFailedError);
        expect(mapped).not.toBeInstanceOf(TransientError);
        expect(mapped.code).toBe("REVISION_CONFLICT");
        expect(mapped.retryable).toBe(false);
        expect(isRetryableError(raw)).toBe(false);
        expect(isRetryableError(mapped)).toBe(false);
        expect(mapped.message).toBe("Resource changed since it was last read.");
        expect(mapped.cause).toBe(raw);
    });

    it("keeps unstructured aborted errors transient", () => {
        const mapped = connectErrorToPolyesterError(new ConnectError("aborted", Code.Aborted));

        expect(mapped).toBeInstanceOf(TransientError);
        expect(mapped.retryable).toBe(true);
    });

    it.each([
        [AuthErrorCode.AUTH_POLICY_IN_USE, PolicyInUseError, "Policy is still in use."],
        [AuthErrorCode.AUTH_POLICY_LOCKED, PolicyLockedError, "Policy is locked."],
        [
            AuthErrorCode.AUTH_POLICY_SCOPE_MISMATCH,
            PolicyScopeMismatchError,
            "Policy does not belong to the target account scope.",
        ],
    ] as const)(
        "maps policy auth detail %s regardless of gRPC code",
        (authCode, expected, fallback) => {
            const raw = authDetailError("", Code.Unknown, authCode);
            const mapped = connectErrorToPolyesterError(raw);

            expect(mapped).toBeInstanceOf(expected);
            expect(mapped.message).toBe(fallback);
            expect(mapped.cause).toBe(raw);
        },
    );

    it("maps MFA auth details to MFA classes", () => {
        expect(
            connectErrorToPolyesterError(
                authDetailError("mfa", Code.PermissionDenied, AuthErrorCode.AUTH_STEP_UP_REQUIRED),
            ),
        ).toBeInstanceOf(StepUpRequiredError);
        expect(
            connectErrorToPolyesterError(
                authDetailError(
                    "mfa",
                    Code.FailedPrecondition,
                    AuthErrorCode.AUTH_MFA_NOT_ENROLLED,
                ),
            ),
        ).toBeInstanceOf(MfaEnrollmentRequiredError);
        const elevation = authDetailError(
            "",
            Code.PermissionDenied,
            AuthErrorCode.AUTH_MFA_ELEVATION_REQUIRED,
        );
        expect(connectErrorToPolyesterError(elevation)).toMatchObject({
            name: "SessionElevationRequiredError",
            code: "SESSION_ELEVATION_REQUIRED",
            message: "Multi-factor authentication required.",
            cause: elevation,
        });
        const lastFactor = authDetailError(
            "",
            Code.FailedPrecondition,
            AuthErrorCode.AUTH_MFA_LAST_FACTOR_REQUIRED,
        );
        expect(connectErrorToPolyesterError(lastFactor)).toMatchObject({
            name: "MfaLastFactorRequiredError",
            code: "MFA_LAST_FACTOR_REQUIRED",
            message: "At least one active MFA factor must remain enrolled.",
            cause: lastFactor,
        });
    });

    it.each([
        [AuthErrorCode.AUTH_MFA_CHALLENGE_INVALID, "challenge-invalid"],
        [AuthErrorCode.AUTH_MFA_CHALLENGE_LOCKED, "challenge-locked"],
        [AuthErrorCode.AUTH_MFA_OTP_INVALID, "otp-invalid"],
        [AuthErrorCode.AUTH_MFA_RECOVERY_INVALID, "recovery-code-invalid"],
        [AuthErrorCode.AUTH_MFA_PASSKEY_CREDENTIAL_INVALID, "passkey-invalid"],
        [AuthErrorCode.AUTH_MFA_PASSKEY_VERIFY_FAILED, "passkey-invalid"],
    ] as const)("maps MFA verification detail %s", (authCode, reason) => {
        const raw = authDetailError("Invalid MFA response", Code.Unknown, authCode);
        const mapped = connectErrorToPolyesterError(raw);

        expect(mapped).toBeInstanceOf(MfaVerificationError);
        expect((mapped as MfaVerificationError).reason).toBe(reason);
        expect(mapped.message).toBe("Invalid MFA response");
        expect(mapped.cause).toBe(raw);
    });

    it("does not infer MFA requirements from mutable backend messages", () => {
        expect(
            connectErrorToPolyesterError(
                new ConnectError("fresh step-up required", Code.PermissionDenied),
            ),
        ).toBeInstanceOf(PermissionError);
        expect(
            connectErrorToPolyesterError(
                new ConnectError("you must enroll in MFA first", Code.FailedPrecondition),
            ),
        ).toBeInstanceOf(PreconditionFailedError);
        expect(
            connectErrorToPolyesterError(
                new ConnectError("subaccount mfa required", Code.PermissionDenied),
            ),
        ).toBeInstanceOf(PermissionError);
        expect(
            connectErrorToPolyesterError(
                new ConnectError("cannot remove the last MFA factor", Code.FailedPrecondition),
            ),
        ).toBeInstanceOf(PreconditionFailedError);
    });

    it("parses retry-after metadata into retryAfterMs", () => {
        const metadata = new Headers({ "retry-after": "2" });
        const ce = new ConnectError("slow down", Code.ResourceExhausted, metadata);
        const mapped = connectErrorToPolyesterError(ce);
        expect(mapped).toBeInstanceOf(RateLimitError);
        expect((mapped as RateLimitError).retryAfterMs).toBe(2000);
    });

    it("maps structured rate-limit details and prefers their retry guidance", () => {
        const rateLimit = create(RateLimitDetailSchema, {
            reason: FailureReason.QUOTA_EXCEEDED,
            limit: 100n,
            remaining: 0n,
            retryAfterMs: 1_500n,
            policyVersion: 7n,
            operationId: "orders.create",
            policyClass: PolicyClass.TRADING_PLACE,
            scope: LimiterScope.SUBACCOUNT,
            refillModel: RefillModel.ROLLING_WINDOW,
        });
        const orderDetail = create(OrderErrorDetailSchema, {
            code: OrderErrorCode.RATE_LIMIT_EXCEEDED,
            rateLimit,
        });
        const raw = new ConnectError(
            "quota exhausted",
            Code.InvalidArgument,
            new Headers({ "retry-after": "9" }),
            [{ desc: OrderErrorDetailSchema, value: orderDetail }],
        );

        const mapped = connectErrorToPolyesterError(raw);

        expect(mapped).toBeInstanceOf(RateLimitError);
        expect(mapped).toMatchObject({
            retryAfterMs: 1_500,
            rateLimit: {
                reason: "quota_exceeded",
                limit: "100",
                remaining: "0",
                retryAfterMs: "1500",
                policyVersion: "7",
                operationId: "orders.create",
                policyClass: "trading_place",
                scope: "subaccount",
                refillModel: "rolling_window",
            },
        });
    });
});

describe("toPolyesterError", () => {
    it("passes through typed errors, aborts, and cancellations", () => {
        const typed = new ValidationError("bad");
        expect(toPolyesterError(typed)).toBe(typed);

        const abort = new DOMException("aborted", "AbortError");
        expect(toPolyesterError(abort)).toBe(abort);

        const cancelled = new ConnectError("cancelled", Code.Canceled);
        expect(toPolyesterError(cancelled)).toBe(cancelled);
    });

    it("unwraps a typed error from the ConnectError cause chain", () => {
        const network = new NetworkError("Transport request failed", {
            cause: new TypeError("Failed to fetch"),
        });
        const ce = ConnectError.from(network);
        expect(toPolyesterError(ce)).toBe(network);
    });

    it("leaves unrelated errors untouched", () => {
        const plain = new Error("not ours");
        expect(toPolyesterError(plain)).toBe(plain);
    });
});

describe("detectMfaErrorKind", () => {
    it("uses the structured detail regardless of backend copy", () => {
        const ce = authDetailError(
            "subaccount mfa required",
            Code.PermissionDenied,
            AuthErrorCode.AUTH_STEP_UP_REQUIRED,
        );
        expect(detectMfaErrorKind(ce)).toBe("step-up");
    });

    it("returns null for non-MFA errors", () => {
        expect(detectMfaErrorKind(new ConnectError("nope", Code.InvalidArgument))).toBeNull();
    });
});

describe("predicates over typed and raw errors", () => {
    it("isResourceNotFoundError accepts typed, mapped, and raw errors", () => {
        expect(isResourceNotFoundError(new ResourceNotFoundError("gone"))).toBe(true);

        const raw = new ConnectError("missing", Code.NotFound);
        expect(isResourceNotFoundError(raw)).toBe(true);
        expect(isResourceNotFoundError(connectErrorToPolyesterError(raw))).toBe(true);

        expect(isResourceNotFoundError(new ValidationError("bad"))).toBe(false);
        expect(isResourceNotFoundError(new Error("nope"))).toBe(false);
    });

    it.each([
        [isPolicyInUseError, PolicyInUseError, AuthErrorCode.AUTH_POLICY_IN_USE],
        [isPolicyLockedError, PolicyLockedError, AuthErrorCode.AUTH_POLICY_LOCKED],
        [
            isPolicyScopeMismatchError,
            PolicyScopeMismatchError,
            AuthErrorCode.AUTH_POLICY_SCOPE_MISMATCH,
        ],
    ] as const)(
        "%s accepts typed, raw, and mapped policy errors",
        (predicate, ErrorClass, code) => {
            const typed = new ErrorClass("policy failure");
            const raw = authDetailError("policy failure", Code.Unknown, code);

            expect(predicate(typed)).toBe(true);
            expect(predicate(raw)).toBe(true);
            expect(predicate(connectErrorToPolyesterError(raw))).toBe(true);
            expect(predicate(new PreconditionFailedError("other failure"))).toBe(false);
        },
    );

    it("isResourceNotFoundError recovers a typed not-found error re-wrapped by Connect", () => {
        const raw = new ConnectError("verification not found", Code.NotFound);
        const typed = connectErrorToPolyesterError(raw);
        const wrapped = ConnectError.from(typed);

        expect(wrapped.code).toBe(Code.Unknown);
        expect(isResourceNotFoundError(wrapped)).toBe(true);
    });

    it("isRevisionConflictError accepts typed, raw, and mapped conflicts", () => {
        const typed = new RevisionConflictError("stale");
        const raw = authDetailError("stale", Code.Aborted, AuthErrorCode.AUTH_REVISION_CONFLICT);

        expect(isRevisionConflictError(typed)).toBe(true);
        expect(isRevisionConflictError(raw)).toBe(true);
        expect(isRevisionConflictError(connectErrorToPolyesterError(raw))).toBe(true);
        expect(
            isRevisionConflictError(new Error("protected operation failed", { cause: typed })),
        ).toBe(true);
        expect(
            isRevisionConflictError(
                new ConnectError("revision conflict: expected 9, current 10", Code.Unknown),
            ),
        ).toBe(true);
        expect(isRevisionConflictError(new ConnectError("aborted", Code.Aborted))).toBe(false);
        expect(
            isRevisionConflictError(new ConnectError("revision conflict", Code.PermissionDenied)),
        ).toBe(false);
        expect(isRevisionConflictError(new PreconditionFailedError("other"))).toBe(false);
    });

    it("isRetryableError keys on the hierarchy for typed errors", () => {
        expect(isRetryableError(new ServiceUnavailableError("down"))).toBe(true);
        expect(isRetryableError(new RateLimitError("slow down"))).toBe(true);
        expect(isRetryableError(new ValidationError("bad"))).toBe(false);
        expect(isRetryableError(new RevisionConflictError("stale"))).toBe(false);
        expect(isRetryableError(new CatalogNotReadyError())).toBe(false);
        expect(isRetryableError(new DOMException("aborted", "AbortError"))).toBe(false);
        // legacy raw ConnectError behavior preserved
        expect(isRetryableError(new ConnectError("down", Code.Unavailable))).toBe(true);
        expect(isRetryableError(new ConnectError("bad", Code.InvalidArgument))).toBe(false);
    });

    it("MFA predicates accept typed, mapped, and raw errors", () => {
        expect(isFreshStepUpRequiredError(new StepUpRequiredError("mfa"))).toBe(true);
        expect(isMfaEnrollmentRequiredError(new MfaEnrollmentRequiredError("mfa"))).toBe(true);
        expect(isSessionElevationRequiredError(new SessionElevationRequiredError("mfa"))).toBe(
            true,
        );
        expect(isMfaLastFactorRequiredError(new MfaLastFactorRequiredError("mfa"))).toBe(true);

        const raw = authDetailError(
            "backend copy may change",
            Code.PermissionDenied,
            AuthErrorCode.AUTH_STEP_UP_REQUIRED,
        );
        expect(isFreshStepUpRequiredError(raw)).toBe(true);
        expect(isFreshStepUpRequiredError(connectErrorToPolyesterError(raw))).toBe(true);
        expect(isFreshStepUpRequiredError(new PermissionError("denied"))).toBe(false);
        expect(
            isFreshStepUpRequiredError(
                new ConnectError("fresh step-up required", Code.PermissionDenied),
            ),
        ).toBe(false);
        expect(
            isMfaLastFactorRequiredError(
                new ConnectError("cannot remove the last MFA factor", Code.FailedPrecondition),
            ),
        ).toBe(false);

        const enrolled = authDetailError(
            "mfa",
            Code.FailedPrecondition,
            AuthErrorCode.AUTH_MFA_NOT_ENROLLED,
        );
        expect(isMfaEnrollmentRequiredError(enrolled)).toBe(true);
        expect(isMfaEnrollmentRequiredError(connectErrorToPolyesterError(enrolled))).toBe(true);

        const elevation = authDetailError(
            "mfa",
            Code.PermissionDenied,
            AuthErrorCode.AUTH_MFA_ELEVATION_REQUIRED,
        );
        expect(isSessionElevationRequiredError(elevation)).toBe(true);
        expect(isSessionElevationRequiredError(connectErrorToPolyesterError(elevation))).toBe(true);

        const lastFactor = authDetailError(
            "mfa",
            Code.FailedPrecondition,
            AuthErrorCode.AUTH_MFA_LAST_FACTOR_REQUIRED,
        );
        expect(isMfaLastFactorRequiredError(lastFactor)).toBe(true);
        expect(isMfaLastFactorRequiredError(connectErrorToPolyesterError(lastFactor))).toBe(true);

        expect(
            isSessionElevationRequiredError(
                ConnectError.from(new SessionElevationRequiredError("backend copy may change")),
            ),
        ).toBe(true);
        expect(
            isMfaLastFactorRequiredError(
                ConnectError.from(new MfaLastFactorRequiredError("backend copy may change")),
            ),
        ).toBe(true);
    });

    it("formatConnectError handles typed and raw errors", () => {
        const raw = new ConnectError("Insufficient funds.", Code.InvalidArgument);
        expect(formatConnectError(raw)).toBe("Insufficient funds.");
        expect(formatConnectError(connectErrorToPolyesterError(raw))).toBe("Insufficient funds.");
        expect(formatConnectError(new Error("[unknown] bad order"))).toBe("bad order");
        expect(formatConnectError(undefined, "fallback")).toBe("fallback");
    });

    it("formatUserFacingError never exposes backend or exception messages", () => {
        const fallback = "Request failed.";

        expect(formatUserFacingError(new Error("postgres: relation users missing"), fallback)).toBe(
            fallback,
        );
        expect(
            formatUserFacingError(
                new ConnectError("postgres: relation users missing", Code.Unknown),
                fallback,
            ),
        ).toBe(fallback);
        expect(
            formatUserFacingError(new InternalServerError("redis connection refused"), fallback),
        ).toBe(fallback);
        expect(
            formatUserFacingError(
                new ConnectError("validator implementation detail", Code.InvalidArgument),
                fallback,
            ),
        ).toBe(fallback);
    });

    it("formatUserFacingError uses SDK-owned copy for safe transport conditions", () => {
        expect(formatUserFacingError(new RateLimitError("backend prose"), "fallback")).toBe(
            "You've made too many requests. Wait a moment and try again.",
        );
        expect(formatUserFacingError(new TimeoutError("backend prose"), "fallback")).toBe(
            "This is taking longer than expected. Try again.",
        );
        expect(
            formatUserFacingError(new ServiceUnavailableError("backend prose"), "fallback"),
        ).toBe("This service is temporarily unavailable. Try again in a few minutes.");
        expect(formatUserFacingError(new NetworkError("backend prose"), "fallback")).toBe(
            "We couldn't connect. Check your internet connection and try again.",
        );
        expect(
            formatUserFacingError(new ConnectError("backend prose", Code.Unavailable), "fallback"),
        ).toBe("This service is temporarily unavailable. Try again in a few minutes.");
        expect(
            formatUserFacingError(
                new ConnectError("backend prose", Code.ResourceExhausted),
                "fallback",
            ),
        ).toBe("You've made too many requests. Wait a moment and try again.");
        expect(
            formatUserFacingError(
                new ConnectError("backend prose", Code.DeadlineExceeded),
                "fallback",
            ),
        ).toBe("This is taking longer than expected. Try again.");
        expect(
            formatUserFacingError(
                new ConnectError("Service temporarily unavailable.", Code.Unknown),
                "fallback",
            ),
        ).toBe("This service is temporarily unavailable. Try again in a few minutes.");
        expect(
            formatUserFacingError(
                new Error("Couldn't place this order. Try again.", {
                    cause: new ConnectError("Service temporarily unavailable.", Code.Unknown),
                }),
                "fallback",
            ),
        ).toBe("This service is temporarily unavailable. Try again in a few minutes.");
    });
});

describe("errorFromHttpStatus", () => {
    it("maps common statuses", () => {
        expect(errorFromHttpStatus(401, "m")).toBeInstanceOf(AuthenticationError);
        expect(errorFromHttpStatus(403, "m")).toBeInstanceOf(PermissionError);
        expect(errorFromHttpStatus(404, "m")).toBeInstanceOf(ResourceNotFoundError);
        expect(errorFromHttpStatus(408, "m")).toBeInstanceOf(TimeoutError);
        expect(errorFromHttpStatus(409, "m")).toBeInstanceOf(AlreadyExistsError);
        expect(errorFromHttpStatus(429, "m")).toBeInstanceOf(RateLimitError);
        expect(errorFromHttpStatus(418, "m")).toBeInstanceOf(RequestError);
        expect(errorFromHttpStatus(500, "m")).toBeInstanceOf(InternalServerError);
        expect(errorFromHttpStatus(503, "m")).toBeInstanceOf(ServiceUnavailableError);
    });
});

describe("error mapping through transports", () => {
    it("rejects service calls with typed errors", async () => {
        // createRouterTransport exercises the same interceptor chain as production
        // transports; we simulate by throwing from a handler.
        const { createErrorMappingInterceptor } = await import("./connect-error-mapping.js");
        const interceptor = createErrorMappingInterceptor();
        const next = () => {
            throw new ConnectError("slow down", Code.ResourceExhausted);
        };
        // @ts-expect-error minimal request stub; the interceptor only touches errors
        await expect(interceptor(next)({})).rejects.toBeInstanceOf(RateLimitError);
    });

    it("maps errors thrown mid-stream", async () => {
        const { createErrorMappingInterceptor } = await import("./connect-error-mapping.js");
        const interceptor = createErrorMappingInterceptor();
        async function* failing() {
            yield 1;
            throw new ConnectError("down", Code.Unavailable);
        }
        const next = () => Promise.resolve({ stream: true, message: failing() });
        // @ts-expect-error minimal request/response stubs
        const res = (await interceptor(next)({})) as { message: AsyncIterable<number> };

        const received: number[] = [];
        await expect(
            (async () => {
                for await (const value of res.message) received.push(value);
            })(),
        ).rejects.toBeInstanceOf(ServiceUnavailableError);
        expect(received).toEqual([1]);
    });
});
