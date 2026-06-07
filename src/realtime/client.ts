import { fromBinary, type DescMessage, type MessageShape } from "@bufbuild/protobuf";
import {
    Centrifuge,
    type SubscriptionErrorContext,
    type PublicationContext,
    type Subscription,
} from "centrifuge/build/protobuf";
import { decodeProtoFrame } from "../utils/streams.js";

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
                const res = await fetch(url, { headers });
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
                      const res = await fetch(this.#config.tokenEndpoint, { headers });
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

        const onPub = handlers.onPublication as PublicationHandler;
        shared.publicationHandlers.add(onPub);

        if (handlers.onSubscribed) shared.subscribedHandlers.add(handlers.onSubscribed);
        if (handlers.onUnsubscribed) shared.unsubscribedHandlers.add(handlers.onUnsubscribed);
        if (handlers.onError) shared.errorHandlers.add(handlers.onError);

        return () => {
            shared.publicationHandlers.delete(onPub);
            if (handlers.onSubscribed) shared.subscribedHandlers.delete(handlers.onSubscribed);
            if (handlers.onUnsubscribed)
                shared.unsubscribedHandlers.delete(handlers.onUnsubscribed);
            if (handlers.onError) shared.errorHandlers.delete(handlers.onError);

            shared.consumers--;
            if (shared.consumers <= 0) {
                const currentShared = this.#sharedSubs.get(channel);
                if (currentShared !== shared) return;

                this.#sharedSubs.delete(channel);
                this.#pendingTeardowns.set(channel, shared);

                queueMicrotask(() => {
                    if (!this.#pendingTeardowns.has(channel)) return;
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
                const decoded = fromBinary(params.schema, data);
                params.onPublication(decoded);
            },
            onSubscribed: params.onConnected,
            onUnsubscribed: params.onDisconnected,
            onError: params.onError,
        });
    }

    connectProtoChannel<T extends DescMessage>(params: ConnectChannelParams<T>): () => void {
        return this.connectChannel({
            ...params,
            onPublication: (data) => {
                const msg = decodeProtoFrame(params.schema, data);
                if (!msg) return;
                params.onPublication(msg);
            },
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
