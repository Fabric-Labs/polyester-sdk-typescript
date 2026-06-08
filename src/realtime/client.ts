import { fromBinary, type DescMessage, type MessageShape } from "@bufbuild/protobuf";
import {
    Centrifuge,
    type SubscriptionErrorContext,
    type PublicationContext,
    type Subscription,
} from "centrifuge/build/protobuf";
import { makeFetch } from "../shared/transports.js";
import { decodeProtoFrame } from "../utils/streams.js";

const realtimeFetch = makeFetch();

export interface RealtimeAuthRequest {
    url: string | URL;
    method: string;
}

export interface RealtimeConfig {
    wsUrl: string;
    tokenEndpoint: string;
    subscribeEndpoint: string;
    getAuthHeaders?: (request: RealtimeAuthRequest) => Promise<HeadersInit> | HeadersInit;
    hasAuth?: () => boolean;
}

type ResolvedRealtimeConfig = Pick<
    RealtimeConfig,
    "wsUrl" | "tokenEndpoint" | "subscribeEndpoint"
> & {
    getAuthHeaders: (request: RealtimeAuthRequest) => Promise<HeadersInit> | HeadersInit;
    hasAuth: () => boolean;
};

export interface SubscribeHandlers<T> {
    onPublication: (data: T) => void;
    onSubscribed?: () => void;
    onUnsubscribed?: () => void;
    onError?: (ctx: SubscriptionErrorContext) => void;
}

export interface ConnectChannelParams<T extends DescMessage> {
    channel: string;
    schema: T;
    onPublication: (data: MessageShape<T>) => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (ctx: SubscriptionErrorContext) => void;
}

type ConnectionHandler = { onConnected?: () => void; onDisconnected?: () => void };
type PublicationHandler<T = unknown> = (data: T) => void;
type ErrorHandler = (ctx: SubscriptionErrorContext) => void;
type RealtimeClientMode = "public" | "authenticated";

function toSubscriptionError(error: unknown): SubscriptionErrorContext["error"] {
    if (error instanceof Error) return { code: 0, message: error.message };
    if (typeof error === "string") return { code: 0, message: error };
    return { code: 0, message: "Unknown realtime subscription error" };
}

function createSubscriptionErrorContext(
    channel: string,
    type: string,
    error: unknown,
): SubscriptionErrorContext {
    return {
        channel,
        type,
        error: toSubscriptionError(error),
    };
}

interface SharedSubscription {
    channel: string;
    sub: Subscription | null;
    client: Centrifuge | null;
    attachmentEpoch: number;
    consumers: number;
    publicationHandlers: Set<PublicationHandler>;
    subscribedHandlers: Set<() => void>;
    unsubscribedHandlers: Set<() => void>;
    errorHandlers: Set<ErrorHandler>;
}

/**
 * Shared Centrifuge realtime client that multiplexes public and private protobuf subscriptions across SDK services.
 */
export class RealtimeClient {
    #client: Centrifuge | null = null;
    #clientMode: RealtimeClientMode | null = null;
    #clientEpoch = 0;
    #connectionHandlers = new Set<ConnectionHandler>();
    #sharedSubs = new Map<string, SharedSubscription>();
    #pendingTeardowns = new Map<string, SharedSubscription>();
    readonly #config: ResolvedRealtimeConfig;

    constructor(config: RealtimeConfig) {
        this.#config = {
            wsUrl: config.wsUrl,
            tokenEndpoint: config.tokenEndpoint,
            subscribeEndpoint: config.subscribeEndpoint,
            getAuthHeaders: config.getAuthHeaders ?? (() => ({})),
            hasAuth: config.hasAuth ?? (() => false),
        };
    }

    async #getAuthHeaders(request: RealtimeAuthRequest): Promise<HeadersInit> {
        return this.#config.getAuthHeaders(request);
    }

    #emitSubscriptionError(shared: SharedSubscription, type: string, error: unknown): void {
        const ctx = createSubscriptionErrorContext(shared.channel, type, error);
        for (const handler of shared.errorHandlers) {
            handler(ctx);
        }
    }

    #emitConnectionTokenError(error: unknown): void {
        for (const shared of this.#sharedSubs.values()) {
            if (shared.channel.startsWith("private:")) {
                this.#emitSubscriptionError(shared, "connection_token", error);
            }
        }
    }

    #subscriptionOpts(shared: SharedSubscription, attachmentEpoch: number) {
        if (!shared.channel.startsWith("private:")) return undefined;
        return {
            getToken: async () => {
                try {
                    const url = new URL(this.#config.subscribeEndpoint);
                    url.searchParams.set("channel", shared.channel);
                    const headers = await this.#getAuthHeaders({ url, method: "GET" });
                    const res = await realtimeFetch(url, { headers });
                    if (!res.ok) {
                        throw new Error(`Failed to fetch subscription token: ${res.status}`);
                    }
                    const json = (await res.json()) as { token?: string };
                    if (!json?.token) throw new Error("No token found");
                    return json.token;
                } catch (error) {
                    if (shared.attachmentEpoch === attachmentEpoch) {
                        this.#emitSubscriptionError(shared, "subscription_token", error);
                    }
                    throw error;
                }
            },
        };
    }

    #hasAuth(): boolean {
        return this.#config.hasAuth();
    }

    #createClient(mode: RealtimeClientMode): Centrifuge {
        const epoch = ++this.#clientEpoch;
        const opts =
            mode === "authenticated"
                ? {
                      getToken: async () => {
                          try {
                              const headers = await this.#getAuthHeaders({
                                  url: this.#config.tokenEndpoint,
                                  method: "GET",
                              });
                              const res = await realtimeFetch(this.#config.tokenEndpoint, {
                                  headers,
                              });
                              if (!res.ok) {
                                  throw new Error(
                                      `Failed to fetch connection token: ${res.status}`,
                                  );
                              }
                              const json = (await res.json()) as { token?: string };
                              if (!json?.token) throw new Error("No connection token found");
                              return json.token;
                          } catch (error) {
                              if (this.#clientEpoch === epoch) {
                                  this.#emitConnectionTokenError(error);
                              }
                              throw error;
                          }
                      },
                  }
                : {};

        this.#client = new Centrifuge(this.#config.wsUrl, opts);
        this.#clientMode = mode;

        this.#client.on("connected", () => {
            if (this.#clientEpoch !== epoch) return;
            for (const h of this.#connectionHandlers) h.onConnected?.();
        });
        this.#client.on("disconnected", () => {
            if (this.#clientEpoch !== epoch) return;
            for (const h of this.#connectionHandlers) h.onDisconnected?.();
        });

        this.#client.connect();
        return this.#client;
    }

    #ensureClientMode(mode: RealtimeClientMode): Centrifuge {
        if (this.#client && this.#clientMode === mode) return this.#client;

        if (!this.#client) return this.#createClient(mode);
        this.#replaceClient(mode);
        if (!this.#client) throw new Error("Failed to initialize realtime client");
        return this.#client;
    }

    #ensureClientForChannel(channel: string): Centrifuge {
        if (channel.startsWith("private:")) {
            if (!this.#hasAuth()) {
                throw new Error(
                    `Cannot subscribe to private channel "${channel}" without authentication`,
                );
            }
            return this.#ensureClientMode("authenticated");
        }

        if (this.#client) return this.#client;
        return this.#ensureClientMode(this.#hasAuth() ? "authenticated" : "public");
    }

    #replaceClient(mode: RealtimeClientMode): void {
        const oldClient = this.#client;
        this.#client = null;
        this.#clientMode = null;
        this.#clientEpoch++;

        for (const shared of this.#sharedSubs.values()) {
            shared.sub = null;
            shared.client = null;
            shared.attachmentEpoch++;
        }
        for (const shared of this.#pendingTeardowns.values()) {
            shared.sub = null;
            shared.client = null;
            shared.attachmentEpoch++;
        }

        try {
            oldClient?.disconnect();
        } catch {
            // noop
        }

        this.#createClient(mode);
        for (const shared of this.#sharedSubs.values()) {
            this.#attachSubscription(shared);
        }
    }

    #attachSubscription(shared: SharedSubscription): void {
        if (shared.sub) return;

        const client = this.#ensureClientForChannel(shared.channel);
        if (shared.sub) return;

        const attachmentEpoch = shared.attachmentEpoch + 1;
        shared.attachmentEpoch = attachmentEpoch;
        const sub = client.newSubscription(
            shared.channel,
            this.#subscriptionOpts(shared, attachmentEpoch),
        );
        shared.sub = sub;
        shared.client = client;

        sub.on("publication", (ctx: PublicationContext) => {
            if (shared.sub !== sub || shared.attachmentEpoch !== attachmentEpoch) return;
            for (const handler of shared.publicationHandlers) handler(ctx.data);
        });
        sub.on("subscribed", () => {
            if (shared.sub !== sub || shared.attachmentEpoch !== attachmentEpoch) return;
            for (const handler of shared.subscribedHandlers) handler();
        });
        sub.on("unsubscribed", () => {
            if (shared.sub !== sub || shared.attachmentEpoch !== attachmentEpoch) return;
            for (const handler of shared.unsubscribedHandlers) handler();
        });
        sub.on("error", (ctx) => {
            if (shared.sub !== sub || shared.attachmentEpoch !== attachmentEpoch) return;
            for (const handler of shared.errorHandlers) handler(ctx);
        });

        sub.subscribe();
    }

    #getOrCreateSubscription(channel: string): SharedSubscription {
        const existing = this.#sharedSubs.get(channel);
        if (existing) return existing;

        const pending = this.#pendingTeardowns.get(channel);
        if (pending) {
            this.#pendingTeardowns.delete(channel);
            this.#sharedSubs.set(channel, pending);
            if (!pending.sub) {
                this.#attachSubscription(pending);
            } else if (pending.sub.state !== "subscribed") {
                pending.sub.subscribe();
            }
            return pending;
        }

        const shared: SharedSubscription = {
            channel,
            sub: null,
            client: null,
            attachmentEpoch: 0,
            consumers: 0,
            publicationHandlers: new Set(),
            subscribedHandlers: new Set(),
            unsubscribedHandlers: new Set(),
            errorHandlers: new Set(),
        };

        this.#sharedSubs.set(channel, shared);
        try {
            this.#attachSubscription(shared);
        } catch (error) {
            this.#sharedSubs.delete(channel);
            throw error;
        }
        return shared;
    }

    #callErrorHandler(handler: ErrorHandler | undefined, ctx: SubscriptionErrorContext): void {
        if (!handler) return;

        try {
            handler(ctx);
        } catch {
            // Keep error reporting isolated from other subscription consumers.
        }
    }

    #callConsumerHandler(
        channel: string,
        type: string,
        handler: () => void,
        onError?: ErrorHandler,
    ): void {
        try {
            handler();
        } catch (error) {
            this.#callErrorHandler(onError, createSubscriptionErrorContext(channel, type, error));
        }
    }

    #teardownSubscription(shared: SharedSubscription): void {
        const sub = shared.sub;
        const client = shared.client;
        shared.sub = null;
        shared.client = null;
        shared.attachmentEpoch++;
        if (!sub) return;

        try {
            if (sub.state !== "unsubscribed") {
                sub.unsubscribe();
            }
        } catch {
            // noop
        }
        try {
            client?.removeSubscription?.(sub);
        } catch {
            // noop
        }
    }

    #disconnect(): void {
        const client = this.#client;

        this.#pendingTeardowns.clear();
        this.#sharedSubs.clear();
        this.#client = null;
        this.#clientMode = null;
        this.#clientEpoch++;

        try {
            client?.disconnect();
        } catch {
            // noop
        }
        this.#connectionHandlers.clear();
    }

    /**
     * Subscribes to a realtime channel and returns an unsubscribe function.
     */
    subscribe<T>(channel: string, handlers: SubscribeHandlers<T>): () => void {
        const shared = this.#getOrCreateSubscription(channel);
        shared.consumers++;

        const publicationHandler = handlers.onPublication;
        const errorHandler = handlers.onError;
        const subscribedHandler = handlers.onSubscribed;
        const unsubscribedHandler = handlers.onUnsubscribed;

        const onError: ErrorHandler | undefined = errorHandler
            ? (ctx) => this.#callErrorHandler(errorHandler, ctx)
            : undefined;
        const onPub: PublicationHandler = (data) => {
            this.#callConsumerHandler(
                channel,
                "publication_handler",
                () => publicationHandler(data as T),
                onError,
            );
        };
        const onSubscribed = subscribedHandler
            ? () =>
                  this.#callConsumerHandler(
                      channel,
                      "subscribed_handler",
                      subscribedHandler,
                      onError,
                  )
            : undefined;
        const onUnsubscribed = unsubscribedHandler
            ? () =>
                  this.#callConsumerHandler(
                      channel,
                      "unsubscribed_handler",
                      unsubscribedHandler,
                      onError,
                  )
            : undefined;

        shared.publicationHandlers.add(onPub);

        if (onSubscribed) shared.subscribedHandlers.add(onSubscribed);
        if (onUnsubscribed) shared.unsubscribedHandlers.add(onUnsubscribed);
        if (onError) shared.errorHandlers.add(onError);

        let closed = false;
        return () => {
            if (closed) return;
            closed = true;

            shared.publicationHandlers.delete(onPub);
            if (onSubscribed) shared.subscribedHandlers.delete(onSubscribed);
            if (onUnsubscribed) shared.unsubscribedHandlers.delete(onUnsubscribed);
            if (onError) shared.errorHandlers.delete(onError);

            shared.consumers--;
            if (shared.consumers <= 0) {
                const currentShared = this.#sharedSubs.get(channel);
                if (currentShared !== shared) return;

                this.#sharedSubs.delete(channel);
                this.#pendingTeardowns.set(channel, shared);

                queueMicrotask(() => {
                    if (this.#pendingTeardowns.get(channel) !== shared) return;
                    this.#pendingTeardowns.delete(channel);

                    this.#teardownSubscription(shared);

                    if (this.#sharedSubs.size === 0 && this.#pendingTeardowns.size === 0) {
                        this.#disconnect();
                    }
                });
            }
        };
    }

    /**
     * Connects to a realtime channel with a custom message decoder.
     */
    connectChannel<T extends DescMessage>(params: ConnectChannelParams<T>): () => void {
        return this.subscribe<Uint8Array>(params.channel, {
            onPublication: (data) => {
                let decoded: MessageShape<T>;
                try {
                    decoded = fromBinary(params.schema, data);
                } catch (error) {
                    this.#callErrorHandler(
                        params.onError,
                        createSubscriptionErrorContext(params.channel, "decode", error),
                    );
                    return;
                }
                params.onPublication(decoded);
            },
            onSubscribed: params.onConnected,
            onUnsubscribed: params.onDisconnected,
            onError: params.onError,
        });
    }

    /**
     * Connects to a realtime channel that emits protobuf messages.
     */
    connectProtoChannel<T extends DescMessage>(params: ConnectChannelParams<T>): () => void {
        return this.subscribe<Uint8Array | MessageShape<T>>(params.channel, {
            onPublication: (data) => {
                let msg: MessageShape<T> | null;
                try {
                    msg = decodeProtoFrame(params.schema, data);
                } catch (error) {
                    this.#callErrorHandler(
                        params.onError,
                        createSubscriptionErrorContext(params.channel, "decode", error),
                    );
                    return;
                }
                if (!msg) {
                    this.#callErrorHandler(
                        params.onError,
                        createSubscriptionErrorContext(
                            params.channel,
                            "decode",
                            "Unable to decode protobuf frame",
                        ),
                    );
                    return;
                }
                params.onPublication(msg);
            },
            onSubscribed: params.onConnected,
            onUnsubscribed: params.onDisconnected,
            onError: params.onError,
        });
    }

    /**
     * Disconnects the realtime client from all active channels.
     */
    disconnect(): void {
        this.#disconnect();
    }

    get isConnected(): boolean {
        return this.#client !== null;
    }

    get activeChannels(): number {
        return this.#sharedSubs.size;
    }

    get totalConsumers(): number {
        let total = 0;
        for (const shared of this.#sharedSubs.values()) {
            total += shared.consumers;
        }
        return total;
    }
}
