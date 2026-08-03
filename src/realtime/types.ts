import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import type { SdkSubscriptionErrorContext } from "../shared/subscription-errors.js";

export interface SubscribeHandlers<T> {
    onPublication: (data: T) => void;
    onSubscribed?: () => void;
    onUnsubscribed?: () => void;
    onError?: (ctx: SdkSubscriptionErrorContext) => void;
}

export interface ConnectChannelParams<T extends DescMessage> {
    channel: string;
    schema: T;
    onPublication: (data: MessageShape<T>) => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (ctx: SdkSubscriptionErrorContext) => void;
}

/**
 * Structural realtime contract consumed by SDK services. The default
 * implementation is the Centrifuge-backed {@link ../realtime/client.js RealtimeClient};
 * alternative implementations (in-memory mocks, custom stacks) can be injected
 * via the client config's `realtimeClient` field.
 */
export interface PolyesterRealtime {
    /** Subscribes to a realtime channel and returns an unsubscribe function. */
    subscribe<T>(channel: string, handlers: SubscribeHandlers<T>): () => void;
    /** Connects to a realtime channel with a custom message decoder. */
    connectChannel<T extends DescMessage>(params: ConnectChannelParams<T>): () => void;
    /** Connects to a realtime channel that emits protobuf messages. */
    connectProtoChannel<T extends DescMessage>(params: ConnectChannelParams<T>): () => void;
    /** Disconnects from all active channels. */
    disconnect(): void;
    /** Disconnects authenticated realtime state without touching public channels. */
    disconnectPrivate(): void;
    readonly isConnected: boolean;
    readonly activeChannels: number;
    readonly totalConsumers: number;
}
