import type { SdkSubscriptionErrorContext } from "./subscription-errors.js";

export interface BaseSubscribeInput<T> {
    /**
     * Called after the channel subscription is confirmed. The unsubscribe function
     * returned by subscribe only starts the connection; wait for the first onOpen
     * call before issuing writes whose events must be observed. Called again after
     * a successful resubscription.
     */
    onOpen?: () => void;
    /** Called when an active channel subscription closes. */
    onClose?: () => void;
    /**
     * Called when the subscription or an event handler reports an error. When omitted,
     * a synchronously detected missing-authentication failure throws instead.
     */
    onError?: (ctx: SdkSubscriptionErrorContext) => void;
    /** Called for each event received while the channel subscription is active. */
    onEvent: (c: T) => void;
}
