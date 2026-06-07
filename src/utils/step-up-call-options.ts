/** HTTP header used to authorize a single sensitive RPC after MFA fresh step-up. */
export const AUTH_STEP_UP_HEADER_NAME = "X-Auth-Step-Up";

/**
 * Connect call options that attach the fresh step-up token, or `undefined` when absent.
 */
export function stepUpCallOptions(stepUpToken?: string | null): { headers: Headers } | undefined {
    const trimmed = (stepUpToken ?? "").trim();
    if (!trimmed) return undefined;
    const headers = new Headers();
    headers.set(AUTH_STEP_UP_HEADER_NAME, trimmed);
    return { headers };
}
