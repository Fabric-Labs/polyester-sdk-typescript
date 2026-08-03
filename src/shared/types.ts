import type { SdkSubscriptionErrorContext } from "./subscription-errors.js";

export interface BaseSubscribeInput<T> {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (ctx: SdkSubscriptionErrorContext) => void;
    onEvent: (c: T) => void;
}
