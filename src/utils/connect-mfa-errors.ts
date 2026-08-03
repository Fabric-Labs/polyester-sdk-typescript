import { toPolyesterError } from "../shared/connect-error-mapping.js";
import {
    MfaEnrollmentRequiredError,
    MfaLastFactorRequiredError,
    SessionElevationRequiredError,
    StepUpRequiredError,
} from "../shared/errors.js";

/**
 * True when the server indicates the user must complete MFA enrollment first.
 * Covers typed SDK errors and raw `ConnectError`s carrying the stable auth detail code.
 */
export function isMfaEnrollmentRequiredError(err: unknown): boolean {
    return toPolyesterError(err) instanceof MfaEnrollmentRequiredError;
}

/**
 * True when the server requires a fresh MFA step-up (retry with `X-Auth-Step-Up`).
 * Covers typed SDK errors and raw `ConnectError`s carrying the stable auth detail code.
 */
export function isFreshStepUpRequiredError(err: unknown): boolean {
    return toPolyesterError(err) instanceof StepUpRequiredError;
}

/**
 * True when the server requires a recent MFA-elevated session, not a one-use
 * fresh step-up proof. Prefer `err instanceof SessionElevationRequiredError`.
 */
export function isSessionElevationRequiredError(err: unknown): boolean {
    return toPolyesterError(err) instanceof SessionElevationRequiredError;
}

/**
 * True when deleting the requested factor would leave no active MFA factors.
 */
export function isMfaLastFactorRequiredError(err: unknown): boolean {
    return toPolyesterError(err) instanceof MfaLastFactorRequiredError;
}
