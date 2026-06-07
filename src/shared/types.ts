import type { SubscriptionErrorContext } from "centrifuge/build/protobuf";

export interface BaseSubscribeInput<T> {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (ctx: SubscriptionErrorContext) => void;
    onEvent: (c: T) => void;
}
