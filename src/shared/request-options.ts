export interface PolyesterRequestOptions {
    signal?: AbortSignal;
}

export interface PolyesterMutationOptions extends PolyesterRequestOptions {
    stepUpToken?: string | null;
}

export const AUTH_STEP_UP_HEADER_NAME = "X-Auth-Step-Up";

export type PolyesterConnectCallOptions = {
    signal?: AbortSignal;
    headers?: Headers;
};

/**
 * Converts SDK request options into Connect RPC call options.
 */
export function toConnectCallOptions(
    options?: PolyesterMutationOptions,
): PolyesterConnectCallOptions | undefined {
    const signal = options?.signal;
    const stepUpToken = (options?.stepUpToken ?? "").trim();

    if (!signal && !stepUpToken) return undefined;

    const callOptions: PolyesterConnectCallOptions = {};
    if (signal) callOptions.signal = signal;
    if (stepUpToken) {
        const headers = new Headers();
        headers.set(AUTH_STEP_UP_HEADER_NAME, stepUpToken);
        callOptions.headers = headers;
    }

    return callOptions;
}
