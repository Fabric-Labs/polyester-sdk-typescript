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

export interface RealtimeConfig {
    wsUrl: string;
    tokenEndpoint: string;
    subscribeEndpoint: string;
    getAuthHeaders?: () => Promise<HeadersInit> | HeadersInit;
    hasAuth?: () => boolean;
}

type ResolvedRealtimeConfig = Pick<
    RealtimeConfig,
    "wsUrl" | "tokenEndpoint" | "subscribeEndpoint"
> & {
    getAuthHeaders: () => Promise<HeadersInit> | HeadersInit;
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
    sub: Subscription;
    consumers: number;
    publicationHandlers: Set<PublicationHandler>;
    subscribedHandlers: Set<() => void>;
    unsubscribedHandlers: Set<() => void>;
    errorHandlers: Set<ErrorHandler>;
}

export class RealtimeClient {
    #client: Centrifuge | null = null;
    #clientUsesAuth = false;
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

    async #getAuthHeaders(): Promise<HeadersInit> {
        return this.#config.getAuthHeaders();
    }

    #subscriptionOpts(channel: string) {
        if (!channel.startsWith("private:")) return undefined;
        return {
            getToken: async () => {
                const headers = await this.#getAuthHeaders();
                const url = new URL(this.#config.subscribeEndpoint);
                url.searchParams.set("channel", channel);
                const res = await realtimeFetch(url, { headers });
                if (!res.ok) throw new Error(`Failed to fetch subscription token: ${res.status}`);
                const json = (await res.json()) as { token?: string };
                if (!json?.token) throw new Error("No token found");
                return json.token;
            },
        };
    }

    #hasAuth(): boolean {
        return this.#config.hasAuth();
    }

    #getOrCreateClient(): Centrifuge {
        if (this.#client) {
            return this.#client;
        }

        const usesAuth = this.#hasAuth();
        const opts = usesAuth
            ? {
                  getToken: async () => {
                      const headers = await this.#getAuthHeaders();
                      const res = await realtimeFetch(this.#config.tokenEndpoint, { headers });
                      if (!res.ok)
                          throw new Error(`Failed to fetch connection token: ${res.status}`);
                      const json = (await res.json()) as { token?: string };
                      if (!json?.token) throw new Error("No connection token found");
                      return json.token;
                  },
              }
            : {};

        this.#client = new Centrifuge(this.#config.wsUrl, opts);
        this.#clientUsesAuth = usesAuth;

        this.#client.on("connected", () => {
            for (const h of this.#connectionHandlers) h.onConnected?.();
        });
        this.#client.on("disconnected", () => {
            for (const h of this.#connectionHandlers) h.onDisconnected?.();
            if (this.#sharedSubs.size > 0 && this.#client) {
                try {
                    this.#client.connect();
                } catch {
                    // noop
                }
            }
        });

        this.#client.connect();
        return this.#client;
    }

    #getOrCreateSubscription(channel: string): SharedSubscription {
        const existing = this.#sharedSubs.get(channel);
        if (existing) return existing;

        const pending = this.#pendingTeardowns.get(channel);
        if (pending) {
            this.#pendingTeardowns.delete(channel);
            this.#sharedSubs.set(channel, pending);
            if (pending.sub.state !== "subscribed") {
                pending.sub.subscribe();
            }
            return pending;
        }

        if (channel.startsWith("private:") && !this.#hasAuth()) {
            throw new Error(
                `Cannot subscribe to private channel "${channel}" without authentication`,
            );
        }

        if (
            channel.startsWith("private:") &&
            this.#client &&
            !this.#clientUsesAuth &&
            this.#hasAuth()
        ) {
            this.#disconnect();
        }

        const client = this.#getOrCreateClient();
        const sub = client.newSubscription(channel, this.#subscriptionOpts(channel));

        const shared: SharedSubscription = {
            sub,
            consumers: 0,
            publicationHandlers: new Set(),
            subscribedHandlers: new Set(),
            unsubscribedHandlers: new Set(),
            errorHandlers: new Set(),
        };

        sub.on("publication", (ctx: PublicationContext) => {
            for (const handler of shared.publicationHandlers) handler(ctx.data);
        });
        sub.on("subscribed", () => {
            for (const handler of shared.subscribedHandlers) handler();
        });
        sub.on("unsubscribed", () => {
            for (const handler of shared.unsubscribedHandlers) handler();
        });
        sub.on("error", (ctx) => {
            for (const handler of shared.errorHandlers) handler(ctx);
        });

        sub.subscribe();
        this.#sharedSubs.set(channel, shared);
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

    #teardownSubscription(sub: Subscription): void {
        try {
            if (sub.state !== "unsubscribed") {
                sub.unsubscribe();
            }
        } catch {
            // noop
        }
        try {
            this.#client?.removeSubscription?.(sub);
        } catch {
            // noop
        }
    }

    #disconnect(): void {
        if (!this.#client) return;

        this.#pendingTeardowns.clear();
        this.#sharedSubs.clear();

        try {
            this.#client.disconnect();
        } catch {
            // noop
        }
        this.#client = null;
        this.#clientUsesAuth = false;
        this.#connectionHandlers.clear();
    }

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

                    this.#teardownSubscription(shared.sub);

                    if (this.#sharedSubs.size === 0 && this.#pendingTeardowns.size === 0) {
                        this.#disconnect();
                    }
                });
            }
        };
    }

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
