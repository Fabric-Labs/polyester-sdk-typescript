import { callerAbortError, preAbortedError } from "./connect-error-mapping.js";
import type { SdkScales } from "./decimal-surface.js";
import { TimeoutError, ValidationError } from "./errors.js";

export interface PolyesterRequestOptions {
    signal?: AbortSignal;
    /**
     * Deadline for the call in milliseconds, a positive integer of at most
     * 2147483647. When it passes, the request is canceled and
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

/**
 * Waits for the catalog inside the call's deadline and abort signal, then returns
 * Connect call options carrying the time left. Giving up rejects only this call;
 * the shared catalog load keeps going for other callers.
 */
export async function readyCallOptions(
    scales: Pick<SdkScales, "ready">,
    options?: PolyesterMutationOptions,
): Promise<PolyesterConnectCallOptions | undefined> {
    const callOptions = toConnectCallOptions(options);
    const signal = callOptions?.signal;
    const timeoutMs = callOptions?.timeoutMs;
    if (signal?.aborted) throw preAbortedError(signal);
    if (!signal && timeoutMs === undefined) {
        await scales.ready();
        return callOptions;
    }

    const start = Date.now();
    const ready = scales.ready();
    await new Promise<void>((resolve, reject) => {
        const settle = (finish: () => void) => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            finish();
        };
        const onAbort = () => settle(() => reject(callerAbortError(signal!)));
        const timer =
            timeoutMs === undefined
                ? undefined
                : setTimeout(
                      () => settle(() => reject(new TimeoutError("Request timed out."))),
                      timeoutMs,
                  );
        signal?.addEventListener("abort", onAbort, { once: true });
        ready.then(
            () => settle(resolve),
            (err: unknown) => settle(() => reject(err)),
        );
    });

    if (callOptions && timeoutMs !== undefined) {
        const remaining = timeoutMs - (Date.now() - start);
        if (remaining <= 0) throw new TimeoutError("Request timed out.");
        callOptions.timeoutMs = remaining;
    }
    return callOptions;
}
