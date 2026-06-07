import { Code, ConnectError } from "@connectrpc/connect";
import { AuthErrorCode, AuthErrorDetailSchema } from "../gen/auth/v1/auth_pb.js";

function getAuthErrorDetails(err: unknown) {
    return ConnectError.from(err).findDetails(AuthErrorDetailSchema);
}

function hasAuthErrorCode(err: unknown, code: AuthErrorCode): boolean {
    return getAuthErrorDetails(err).some((detail) => detail.code === code);
}

function getNormalizedConnectMessage(err: unknown): string {
    const ce = ConnectError.from(err);
    const raw = ce.message ?? "";
    const match = raw.match(/^\[[^\]]*]\s*(.*)$/);
    return (match?.[1] ? match[1] : raw).trim();
}

function getConnectErrorCode(err: unknown): Code {
    return ConnectError.from(err).code;
}

function isFailedPreconditionError(err: unknown): boolean {
    return getConnectErrorCode(err) === Code.FailedPrecondition;
}

function isPermissionDeniedError(err: unknown): boolean {
    return getConnectErrorCode(err) === Code.PermissionDenied;
}

/** True when the server indicates the user must complete MFA enrollment first. */
export function isMfaEnrollmentRequiredError(err: unknown): boolean {
    if (hasAuthErrorCode(err, AuthErrorCode.AUTH_MFA_NOT_ENROLLED)) return true;

    const message = getNormalizedConnectMessage(err).toLowerCase();
    if (
        message.includes("enroll mfa") ||
        message.includes("enroll in mfa") ||
        message.includes("mfa required") ||
        message.includes("must enroll")
    ) {
        return true;
    }
    return isFailedPreconditionError(err) && message.includes("mfa");
}

/**
 * True when the server requires a fresh MFA step-up (retry with `X-Auth-Step-Up`).
 * Message heuristics match common backend phrasing; adjust if server standardizes errors.
 */
export function isFreshStepUpRequiredError(err: unknown): boolean {
    if (hasAuthErrorCode(err, AuthErrorCode.AUTH_STEP_UP_REQUIRED)) return true;

    const message = getNormalizedConnectMessage(err).toLowerCase();
    if (
        message.includes("fresh step-up") ||
        message.includes("fresh-step-up") ||
        message.includes("step up required") ||
        message.includes("step-up required") ||
        message.includes("x-auth-step-up")
    ) {
        return true;
    }
    return isPermissionDeniedError(err) && message.includes("step");
}

/**
 * True when the server requires a recent MFA-elevated session, not a one-use
 * fresh step-up proof.
 */
export function isSessionElevationRequiredError(err: unknown): boolean {
    const message = getNormalizedConnectMessage(err).toLowerCase();
    if (
        message.includes("subaccount_mfa_required") ||
        message.includes("subaccount mfa required") ||
        message.includes("member mfa required") ||
        message.includes("session elevation required") ||
        message.includes("mfa elevation required") ||
        message.includes("mfa elevated session required") ||
        message.includes("recent mfa required")
    ) {
        return true;
    }

    return (
        isPermissionDeniedError(err) && message.includes("subaccount") && message.includes("mfa")
    );
}
