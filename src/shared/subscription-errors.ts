import type { SubscriptionErrorContext as CentrifugeSubscriptionErrorContext } from "centrifuge/build/protobuf";
import { RealtimeError } from "./errors.js";

export type SdkSubscriptionErrorContext = {
    channel: string;
    type: string;
    /**
     * Always an `Error`. Server and websocket failures arrive as {@link RealtimeError};
     * skip reporting when `retryable` is true, the realtime client is already retrying.
     */
    error: Error;
};

function toRealtimeError(error: unknown, retryable: boolean): Error {
    if (error instanceof Error) return error;
    if (typeof error === "string") return new RealtimeError(error, { retryable });
    if (typeof error === "object" && error !== null) {
        const { code, message } = error as { code?: unknown; message?: unknown };
        return new RealtimeError(
            typeof message === "string" && message
                ? message
                : "Unknown realtime subscription error",
            { realtimeCode: typeof code === "number" ? code : 0, retryable },
        );
    }
    return new RealtimeError("Unknown realtime subscription error", { retryable });
}

export function createSdkSubscriptionErrorContext(
    channel: string,
    type: string,
    error: unknown,
): SdkSubscriptionErrorContext {
    return { channel, type, error: toRealtimeError(error, false) };
}

export function publicationHandlerErrorContext(
    channel: string,
    error: unknown,
): SdkSubscriptionErrorContext {
    return createSdkSubscriptionErrorContext(channel, "publication_handler", error);
}

/**
 * Delivers every event of one batch publication in order. A failing event is
 * reported on its own, so it does not drop the rest of the batch.
 */
export function deliverBatch<T>(
    channel: string,
    events: readonly T[],
    deliver: (event: T) => void,
    onError: ((error: SdkSubscriptionErrorContext) => void) | undefined,
): void {
    for (const event of events) {
        try {
            deliver(event);
        } catch (error) {
            onError?.(publicationHandlerErrorContext(channel, error));
        }
    }
}

/**
 * Centrifuge emits plain `{ code, message, temporary }` objects despite its types, and
 * only emits subscription `error` events for failures it retries itself; fatal ones
 * arrive as `unsubscribed`.
 */
export function fromCentrifugeSubscriptionError(
    ctx: CentrifugeSubscriptionErrorContext,
): SdkSubscriptionErrorContext {
    return { channel: ctx.channel, type: ctx.type, error: toRealtimeError(ctx.error, true) };
}
