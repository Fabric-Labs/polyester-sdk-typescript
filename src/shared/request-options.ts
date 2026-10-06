export interface PolyesterRequestOptions {
    signal?: AbortSignal;
    /**
     * Deadline for the call in milliseconds. When it passes, the request is
     * cancelled and rejects with `TimeoutError`. Also sent to the backend as the
     * Connect deadline.
     */
    timeoutMs?: number;
}

export interface PolyesterMutationOptions extends PolyesterRequestOptions {
    stepUpToken?: string | null;
}

export const AUTH_STEP_UP_HEADER_NAME = "X-Auth-Step-Up";

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
