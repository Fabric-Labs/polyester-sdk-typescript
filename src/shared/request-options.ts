import { ValidationError } from "./errors.js";

export interface PolyesterRequestOptions {
    signal?: AbortSignal;
    /**
     * Deadline for the call in milliseconds, a positive integer of at most
     * 2147483647. When it passes, the request is cancelled and
     * rejects with `TimeoutError`. Also sent to the backend as the Connect
     * deadline. Other values throw `ValidationError`.
     */
    timeoutMs?: number;
}

export interface PolyesterMutationOptions extends PolyesterRequestOptions {
    stepUpToken?: string | null;
}

export const AUTH_STEP_UP_HEADER_NAME = "X-Auth-Step-Up";

// Largest `timeoutMs`: `setTimeout` fires immediately for longer delays.
const MAX_TIMEOUT_MS = 2_147_483_647;

export type PolyesterConnectCallOptions = {
    signal?: AbortSignal;
    timeoutMs?: number;
    headers?: Headers;
};

/**
 * Converts SDK request options into Connect RPC call options.
 */
export function toConnectCallOptions(
    options?: PolyesterMutationOptions,
): PolyesterConnectCallOptions | undefined {
    const signal = options?.signal;
    const timeoutMs = options?.timeoutMs;
    const stepUpToken = (options?.stepUpToken ?? "").trim();

    // Connect treats <= 0 as no deadline and sends the value verbatim as
    // connect-timeout-ms, which must be an integer.
    if (
        timeoutMs !== undefined &&
        !(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT_MS)
    ) {
        throw new ValidationError(
            `timeoutMs must be a positive integer of at most ${MAX_TIMEOUT_MS}, got ${timeoutMs}.`,
        );
    }

    if (!signal && timeoutMs === undefined && !stepUpToken) return undefined;

    const callOptions: PolyesterConnectCallOptions = {};
    if (signal) callOptions.signal = signal;
    if (timeoutMs !== undefined) callOptions.timeoutMs = timeoutMs;
    if (stepUpToken) {
        const headers = new Headers();
        headers.set(AUTH_STEP_UP_HEADER_NAME, stepUpToken);
        callOptions.headers = headers;
    }

    return callOptions;
}
