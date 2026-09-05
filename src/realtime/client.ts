import { fromBinary, type DescMessage, type MessageShape } from "@bufbuild/protobuf";
import type {
    Centrifuge,
    SubscriptionErrorContext,
    PublicationContext,
    Subscription,
} from "centrifuge/build/protobuf";
import type * as CentrifugeModule from "centrifuge/build/protobuf";
import {
    createSdkSubscriptionErrorContext,
    fromCentrifugeSubscriptionError,
    type SdkSubscriptionErrorContext,
} from "../shared/subscription-errors.js";
import {
    AuthenticationError,
    errorFromHttpStatus,
    InternalServerError,
    PolyesterError,
} from "../shared/errors.js";
import { makeFetch } from "../shared/transports.js";
import { decodeProtoFrame } from "../utils/streams.js";
import type { ConnectChannelParams, PolyesterRealtime, SubscribeHandlers } from "./types.js";

const realtimeFetch = makeFetch();

type CentrifugeCtor = typeof CentrifugeModule.Centrifuge;
type CentrifugeModuleLoader = () => Promise<typeof CentrifugeModule>;

const defaultCentrifugeModuleLoader: CentrifugeModuleLoader = () =>
    import("centrifuge/build/protobuf");

// Centrifuge's protobuf build embeds the protobuf.js runtime (~300 KB minified).
// Loading it lazily keeps it out of the eager module graph on both the server
// (Cloudflare isolate cold start — SSR never opens a websocket) and the client
// app shell; it is only fetched when the first subscription attaches.
let centrifugeCtorPromise: Promise<CentrifugeCtor> | null = null;
let loadedCentrifugeCtor: CentrifugeCtor | null = null;
let centrifugeModuleLoader = defaultCentrifugeModuleLoader;
export function __setRealtimeCentrifugeForTests(Centrifuge: CentrifugeCtor | null): void {
    loadedCentrifugeCtor = Centrifuge;
    centrifugeCtorPromise = Centrifuge ? Promise.resolve(Centrifuge) : null;
}

/** Replaces the lazy Centrifuge module loader for isolated transport-load tests. */
export function __setRealtimeCentrifugeLoaderForTests(loader: CentrifugeModuleLoader | null): void {
    centrifugeModuleLoader = loader ?? defaultCentrifugeModuleLoader;
    loadedCentrifugeCtor = null;
    centrifugeCtorPromise = null;
}

function loadCentrifuge(): Promise<CentrifugeCtor> {
    if (
        centrifugeModuleLoader === defaultCentrifugeModuleLoader &&
        (import.meta as { env?: { SSR?: boolean } }).env?.SSR
    ) {
        return Promise.reject(new Error("Realtime subscriptions are browser-only during SSR."));
    }

    if (!centrifugeCtorPromise) {
        const loadAttempt = Promise.resolve().then(centrifugeModuleLoader);
        const retryableLoad = loadAttempt.then(
            (mod) => {
                loadedCentrifugeCtor = mod.Centrifuge;
                return mod.Centrifuge;
            },
            (error) => {
                if (centrifugeCtorPromise === retryableLoad) centrifugeCtorPromise = null;
                throw error;
            },
        );
        centrifugeCtorPromise = retryableLoad;
    }
    return centrifugeCtorPromise;
}

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

export type { ConnectChannelParams, PolyesterRealtime, SubscribeHandlers } from "./types.js";

type ConnectionHandler = { onConnected?: () => void; onDisconnected?: () => void };
type PublicationHandler<T = unknown> = (data: T) => void;
type ErrorHandler = (ctx: SdkSubscriptionErrorContext) => void;
type RealtimeClientKind = "public" | "private";

interface SharedSubscription {
    channel: string;
    sub: Subscription | null;
    client: Centrifuge | null;
    attachmentEpoch: number;
    consumers: number;
    subscriptionEpoch: number;
    publicationHandlers: Set<PublicationHandler>;
    subscribedHandlers: Set<(epoch: number) => void>;
    unsubscribedHandlers: Set<() => void>;
    errorHandlers: Set<ErrorHandler>;
}

/**
 * Shared Centrifuge realtime client that multiplexes public and private protobuf subscriptions across SDK services.
 */
export class RealtimeClient implements PolyesterRealtime {
    #publicClient: Centrifuge | null = null;
    #privateClient: Centrifuge | null = null;
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
        const ctx = createSdkSubscriptionErrorContext(shared.channel, type, error);
        for (const handler of shared.errorHandlers) {
            handler(ctx);
        }
    }

    #emitConnectionTokenError(error: unknown): void {
        for (const shared of this.#sharedSubs.values()) {
            if (this.#channelKind(shared.channel) === "private") {
                this.#emitSubscriptionError(shared, "connection_token", error);
            }
        }
    }

    #subscriptionOpts(
        Centrifuge: CentrifugeCtor,
        shared: SharedSubscription,
        attachmentEpoch: number,
    ) {
        if (this.#channelKind(shared.channel) !== "private") return undefined;
        return {
            getToken: async () => {
                try {
                    const url = new URL(this.#config.subscribeEndpoint);
                    url.searchParams.set("channel", shared.channel);
                    const headers = await this.#getAuthHeaders({ url, method: "GET" });
                    const res = await realtimeFetch(url, { headers });
                    if (!res.ok) {
                        throw errorFromHttpStatus(
                            res.status,
                            `Failed to fetch subscription token: ${res.status}`,
                        );
                    }
                    const json = (await res.json()) as { token?: string };
                    if (!json?.token) {
                        throw new InternalServerError("Subscription token response had no token");
                    }
                    return json.token;
                } catch (error) {
                    if (shared.attachmentEpoch === attachmentEpoch) {
                        this.#emitSubscriptionError(shared, "subscription_token", error);
                    }
                    if (error instanceof PolyesterError && !error.retryable) {
                        throw new Centrifuge.UnauthorizedError(error.message);
                    }
                    throw error;
                }
            },
        };
    }

    #hasAuth(): boolean {
        return this.#config.hasAuth();
    }

    #channelKind(channel: string): RealtimeClientKind {
        return channel.startsWith("private:") ? "private" : "public";
    }

    #createPublicClient(Centrifuge: CentrifugeCtor): Centrifuge {
        const client = new Centrifuge(this.#config.wsUrl);
        this.#publicClient = client;

        client.on("connected", () => {
            if (this.#publicClient !== client) return;
            for (const h of this.#connectionHandlers) h.onConnected?.();
        });
        client.on("disconnected", () => {
            if (this.#publicClient !== client) return;
            for (const h of this.#connectionHandlers) h.onDisconnected?.();
        });

        client.connect();
        return client;
    }

    #createPrivateClient(Centrifuge: CentrifugeCtor): Centrifuge {
        let client: Centrifuge;
        const opts = {
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
                        throw errorFromHttpStatus(
                            res.status,
                            `Failed to fetch connection token: ${res.status}`,
                        );
                    }
                    const json = (await res.json()) as { token?: string };
                    if (!json?.token) {
                        throw new InternalServerError("Connection token response had no token");
                    }
                    return json.token;
                } catch (error) {
                    if (this.#privateClient === client) {
                        this.#emitConnectionTokenError(error);
                    }
                    if (error instanceof PolyesterError && !error.retryable) {
                        throw new Centrifuge.UnauthorizedError(error.message);
                    }
                    throw error;
                }
            },
        };

        client = new Centrifuge(this.#config.wsUrl, opts);
        this.#privateClient = client;

        client.on("connected", () => {
            if (this.#privateClient !== client) return;
            for (const h of this.#connectionHandlers) h.onConnected?.();
        });
        client.on("disconnected", () => {
            if (this.#privateClient !== client) return;
            for (const h of this.#connectionHandlers) h.onDisconnected?.();
        });

        client.connect();
        return client;
    }

    #ensurePublicClient(Centrifuge: CentrifugeCtor): Centrifuge {
        return this.#publicClient ?? this.#createPublicClient(Centrifuge);
    }

    #ensurePrivateClient(Centrifuge: CentrifugeCtor): Centrifuge {
        if (!this.#hasAuth()) {
            throw new AuthenticationError(
                "Cannot create authenticated realtime client without authentication",
            );
        }
        return this.#privateClient ?? this.#createPrivateClient(Centrifuge);
    }

    #assertChannelAuth(channel: string): void {
        if (this.#channelKind(channel) === "private" && !this.#hasAuth()) {
            throw new AuthenticationError(
                `Cannot subscribe to private channel "${channel}" without authentication`,
            );
        }
    }

    #ensureClientForChannel(Centrifuge: CentrifugeCtor, channel: string): Centrifuge {
        this.#assertChannelAuth(channel);
        if (this.#channelKind(channel) === "private") {
            return this.#ensurePrivateClient(Centrifuge);
        }

        return this.#ensurePublicClient(Centrifuge);
    }

    #attachSubscription(shared: SharedSubscription): void {
        if (shared.sub) return;

        // Auth failures must surface synchronously to subscribe() callers, as
        // they did when centrifuge was imported statically.
        this.#assertChannelAuth(shared.channel);

        const attachmentEpoch = shared.attachmentEpoch + 1;
        shared.attachmentEpoch = attachmentEpoch;

        // Once the transport module is loaded, attachment stays fully
        // synchronous — only the very first attach pays the dynamic import.
        if (loadedCentrifugeCtor) {
            this.#attachSubscriptionNow(loadedCentrifugeCtor, shared, attachmentEpoch);
            return;
        }
        void this.#attachSubscriptionWhenLoaded(shared, attachmentEpoch);
    }

    async #attachSubscriptionWhenLoaded(
        shared: SharedSubscription,
        attachmentEpoch: number,
    ): Promise<void> {
        let Centrifuge: CentrifugeCtor;
        try {
            Centrifuge = await loadCentrifuge();
        } catch (error) {
            if (shared.attachmentEpoch !== attachmentEpoch) return;
            if (this.#sharedSubs.get(shared.channel) === shared) {
                this.#sharedSubs.delete(shared.channel);
            }
            this.#emitSubscriptionError(shared, "transport_load", error);
            return;
        }

        // The subscription may have been torn down or re-attached while the
        // transport module was loading.
        if (shared.attachmentEpoch !== attachmentEpoch || shared.sub) return;
        if (this.#sharedSubs.get(shared.channel) !== shared) return;

        try {
            this.#attachSubscriptionNow(Centrifuge, shared, attachmentEpoch);
        } catch (error) {
            this.#sharedSubs.delete(shared.channel);
            this.#emitSubscriptionError(shared, "auth", error);
        }
    }

    #attachSubscriptionNow(
        Centrifuge: CentrifugeCtor,
        shared: SharedSubscription,
        attachmentEpoch: number,
    ): void {
        const client = this.#ensureClientForChannel(Centrifuge, shared.channel);

        const sub = client.newSubscription(
            shared.channel,
            this.#subscriptionOpts(Centrifuge, shared, attachmentEpoch),
        );
        shared.sub = sub;
        shared.client = client;

        sub.on("publication", (ctx: PublicationContext) => {
            if (shared.sub !== sub || shared.attachmentEpoch !== attachmentEpoch) return;
            for (const handler of shared.publicationHandlers) handler(ctx.data);
        });
        sub.on("subscribed", () => {
            if (shared.sub !== sub || shared.attachmentEpoch !== attachmentEpoch) return;
            const subscriptionEpoch = ++shared.subscriptionEpoch;
            for (const handler of shared.subscribedHandlers) handler(subscriptionEpoch);
        });
        sub.on("unsubscribed", () => {
            if (shared.sub !== sub || shared.attachmentEpoch !== attachmentEpoch) return;
            for (const handler of shared.unsubscribedHandlers) handler();
        });
        sub.on("error", (ctx: SubscriptionErrorContext) => {
            if (shared.sub !== sub || shared.attachmentEpoch !== attachmentEpoch) return;
            const sdkCtx = fromCentrifugeSubscriptionError(ctx);
            for (const handler of shared.errorHandlers) handler(sdkCtx);
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
            subscriptionEpoch: 0,
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

    #callErrorHandler(handler: ErrorHandler | undefined, ctx: SdkSubscriptionErrorContext): void {
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
            this.#callErrorHandler(
                onError,
                createSdkSubscriptionErrorContext(channel, type, error),
            );
        }
    }

    #teardownSubscription(shared: SharedSubscription): void {
        const sub = shared.sub;
        const client = shared.client;
        const kind = this.#channelKind(shared.channel);
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
        this.#disconnectClientIfIdle(kind);
    }

    #hasChannelsForKind(kind: RealtimeClientKind): boolean {
        for (const shared of this.#sharedSubs.values()) {
            if (this.#channelKind(shared.channel) === kind) return true;
        }
        for (const shared of this.#pendingTeardowns.values()) {
            if (this.#channelKind(shared.channel) === kind) return true;
        }
        return false;
    }

    #disconnectClientIfIdle(kind: RealtimeClientKind): void {
        if (this.#hasChannelsForKind(kind)) return;

        const client = kind === "private" ? this.#privateClient : this.#publicClient;
        if (kind === "private") {
            this.#privateClient = null;
        } else {
            this.#publicClient = null;
        }

        try {
            client?.disconnect();
        } catch {
            // noop
        }
    }

    #disconnect(): void {
        const publicClient = this.#publicClient;
        const privateClient = this.#privateClient;

        this.#pendingTeardowns.clear();
        this.#sharedSubs.clear();
        this.#publicClient = null;
        this.#privateClient = null;

        try {
            publicClient?.disconnect();
        } catch {
            // noop
        }
        try {
            privateClient?.disconnect();
        } catch {
            // noop
        }
        this.#connectionHandlers.clear();
    }

    #disconnectPrivate(): void {
        const privateClient = this.#privateClient;
        this.#privateClient = null;

        for (const [channel, shared] of this.#sharedSubs) {
            if (this.#channelKind(channel) !== "private") continue;
            this.#sharedSubs.delete(channel);
            this.#teardownSubscription(shared);
        }
        for (const [channel, shared] of this.#pendingTeardowns) {
            if (this.#channelKind(channel) !== "private") continue;
            this.#pendingTeardowns.delete(channel);
            this.#teardownSubscription(shared);
        }

        try {
            privateClient?.disconnect();
        } catch {
            // noop
        }
    }

    /**
     * Subscribes to a realtime channel and returns an unsubscribe function. Missing
     * authentication is reported to `onError`, or thrown synchronously when no error
     * observer is provided. Non-retryable token failures stop automatic retries;
     * calling subscribe again after correcting the failure restarts private realtime.
     */
    subscribe<T>(channel: string, handlers: SubscribeHandlers<T>): () => void {
        let shared: SharedSubscription;
        try {
            shared = this.#getOrCreateSubscription(channel);
        } catch (error) {
            if (!(error instanceof AuthenticationError)) throw error;
            if (!handlers.onError) throw error;

            const ctx = createSdkSubscriptionErrorContext(channel, "auth", error);
            queueMicrotask(() => this.#callErrorHandler(handlers.onError, ctx));
            return () => {};
        }
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
        let lastSubscribedEpoch = -1;
        const onSubscribed = subscribedHandler
            ? (subscriptionEpoch: number) => {
                  if (subscriptionEpoch <= lastSubscribedEpoch) return;
                  lastSubscribedEpoch = subscriptionEpoch;
                  this.#callConsumerHandler(
                      channel,
                      "subscribed_handler",
                      subscribedHandler,
                      onError,
                  );
              }
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

        // Only an explicit subscribe restarts terminal private token failures.
        if (this.#channelKind(channel) === "private" && this.#hasAuth()) {
            if (shared.client?.state === "disconnected") shared.client.connect();
            if (shared.sub?.state === "unsubscribed") shared.sub.subscribe();
        }

        let closed = false;
        if (onSubscribed && shared.sub?.state === "subscribed") {
            const subscriptionEpoch = shared.subscriptionEpoch;
            queueMicrotask(() => {
                if (closed || shared.sub?.state !== "subscribed") return;
                onSubscribed(subscriptionEpoch);
            });
        }

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
                        createSdkSubscriptionErrorContext(params.channel, "decode", error),
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
                        createSdkSubscriptionErrorContext(params.channel, "decode", error),
                    );
                    return;
                }
                if (!msg) {
                    this.#callErrorHandler(
                        params.onError,
                        createSdkSubscriptionErrorContext(
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

    /**
     * Disconnects authenticated realtime state without touching public channels.
     */
    disconnectPrivate(): void {
        this.#disconnectPrivate();
    }

    get isConnected(): boolean {
        return this.#publicClient !== null || this.#privateClient !== null;
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
