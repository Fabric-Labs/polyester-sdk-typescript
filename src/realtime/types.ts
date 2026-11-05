import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import type { SdkSubscriptionErrorContext } from "../shared/subscription-errors.js";
import type { ConnectPrivateOrdersParams } from "./private-orders.js";

export interface SubscribeHandlers<T> {
    onPublication: (data: T) => void;
    onSubscribed?: () => void;
    onUnsubscribed?: () => void;
    /** Observes subscription failures. Missing authentication throws when omitted. */
    onError?: (ctx: SdkSubscriptionErrorContext) => void;
}

export interface ConnectChannelParams<T extends DescMessage> {
    channel: string;
    schema: T;
    onPublication: (data: MessageShape<T>) => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
    /** Observes subscription failures. Missing authentication throws when omitted. */
    onError?: (ctx: SdkSubscriptionErrorContext) => void;
}

export type RealtimeConnectionState = "connecting" | "connected" | "disconnected";

export interface RealtimeConnectionStatus {
    /** `"disconnected"` also means no socket is open because no channel needs one. */
    readonly state: RealtimeConnectionState;
    /**
     * The first failure of the current outage, or `null`. Set while the socket cannot
     * connect (it keeps retrying in `"connecting"`) or after it closed for good, and
     * cleared once it connects.
     */
    readonly error: Error | null;
}

/** Status of the public and the private Centrifuge sockets. Replaced, never mutated. */
export interface RealtimeConnection {
    readonly public: RealtimeConnectionStatus;
    readonly private: RealtimeConnectionStatus;
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
    /** Streams one account's orders over the private WebSocket. */
    connectPrivateOrders(params: ConnectPrivateOrdersParams): () => void;
    /** Disconnects from all active channels. */
    disconnect(): void;
    /** Disconnects authenticated realtime state without touching public channels. */
    disconnectPrivate(): void;
    /** Socket status; private order streams run on their own socket and are not included. */
    readonly connection: RealtimeConnection;
    /** Calls `listener` with the new {@link RealtimeConnection} on every change. Returns an unsubscribe function. */
    onConnectionChange(listener: (connection: RealtimeConnection) => void): () => void;
    readonly activeChannels: number;
    readonly totalConsumers: number;
}
