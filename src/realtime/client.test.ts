import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type TokenOpts = { getToken?: () => Promise<string> };
type MockSubscriptionState = "subscribed" | "subscribing" | "unsubscribed";
type MockEventHandler = (...args: unknown[]) => void;

interface MockSubscriptionRecord {
    channel: string;
    opts?: TokenOpts;
    state: MockSubscriptionState;
    subscribeCalls: number;
    unsubscribeCalls: number;
    tokenPromise?: Promise<string>;
    handlers: Map<string, MockEventHandler[]>;
    on: (event: string, handler: MockEventHandler) => void;
    emit: (event: string, ...args: unknown[]) => void;
    subscribe: () => void;
    unsubscribe: () => void;
}

interface MockCentrifugeRecord {
    wsUrl: string;
    opts: TokenOpts;
    subscriptions: MockSubscriptionRecord[];
    removedSubscriptions: MockSubscriptionRecord[];
    connectCalls: number;
    disconnectCalls: number;
    tokenPromise?: Promise<string>;
    handlers: Map<string, MockEventHandler[]>;
    on: (event: string, handler: MockEventHandler) => void;
    emit: (event: string, ...args: unknown[]) => void;
}

const centrifugeState = {
    instances: [] as MockCentrifugeRecord[],
};

class MockSubscription implements MockSubscriptionRecord {
    state: MockSubscriptionState = "unsubscribed";
    subscribeCalls = 0;
    unsubscribeCalls = 0;
    tokenPromise: Promise<string> | undefined;
    handlers = new Map<string, MockEventHandler[]>();

    constructor(
        readonly channel: string,
        readonly opts?: TokenOpts,
    ) {}

    on(event: string, handler: MockEventHandler): void {
        const handlers = this.handlers.get(event) ?? [];
        handlers.push(handler);
        this.handlers.set(event, handlers);
    }

    emit(event: string, ...args: unknown[]): void {
        for (const handler of this.handlers.get(event) ?? []) {
            handler(...args);
        }
    }

    subscribe(): void {
        this.subscribeCalls++;
        this.state = "subscribed";
        this.tokenPromise = this.opts?.getToken?.();
        this.tokenPromise?.catch(() => {});
    }

    unsubscribe(): void {
        this.unsubscribeCalls++;
        this.state = "unsubscribed";
    }
}

class MockCentrifuge implements MockCentrifugeRecord {
    subscriptions: MockSubscriptionRecord[] = [];
    removedSubscriptions: MockSubscriptionRecord[] = [];
    connectCalls = 0;
    disconnectCalls = 0;
    handlers = new Map<string, MockEventHandler[]>();
    tokenPromise: Promise<string> | undefined;

    constructor(
        readonly wsUrl: string,
        readonly opts: TokenOpts = {},
    ) {
        centrifugeState.instances.push(this);
    }

    on(event: string, handler: MockEventHandler): void {
        const handlers = this.handlers.get(event) ?? [];
        handlers.push(handler);
        this.handlers.set(event, handlers);
    }

    emit(event: string, ...args: unknown[]): void {
        for (const handler of this.handlers.get(event) ?? []) {
            handler(...args);
        }
    }

    connect(): void {
        this.connectCalls++;
        this.tokenPromise = this.opts.getToken?.();
        this.tokenPromise?.catch(() => {});
    }

    newSubscription(channel: string, opts?: TokenOpts): MockSubscriptionRecord {
        const subscription = new MockSubscription(channel, opts);
        this.subscriptions.push(subscription);
        return subscription;
    }

    removeSubscription(sub: MockSubscriptionRecord): void {
        this.removedSubscriptions.push(sub);
    }

    disconnect(): void {
        this.disconnectCalls++;
    }
}

import { __setRealtimeCentrifugeForTests, RealtimeClient } from "./client.js";
import { OrderSchema } from "../gen/orders/v1/orders_read_pb.js";
import { AuthenticationError } from "../shared/errors.js";

async function waitForAsyncTokens(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function createPublicRealtimeClient(): RealtimeClient {
    return new RealtimeClient({
        wsUrl: "wss://stream.example.test",
        tokenEndpoint: "https://api.example.test/v1/rt/token",
        subscribeEndpoint: "https://api.example.test/v1/rt/subscribe",
    });
}

function firstInstance(): MockCentrifugeRecord {
    const instance = centrifugeState.instances[0];
    if (!instance) throw new Error("Expected a realtime client instance");
    return instance;
}

function firstSubscription(instance = firstInstance()): MockSubscriptionRecord {
    const subscription = instance.subscriptions[0];
    if (!subscription) throw new Error("Expected a realtime subscription");
    return subscription;
}

describe("RealtimeClient", () => {
    beforeAll(() => {
        __setRealtimeCentrifugeForTests(MockCentrifuge as never);
        centrifugeState.instances.length = 0;
    });

    afterAll(() => {
        __setRealtimeCentrifugeForTests(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        centrifugeState.instances.length = 0;
    });

    it("reports missing authentication through onError without throwing", async () => {
        const client = createPublicRealtimeClient();
        const onError = vi.fn();

        const unsubscribe = client.subscribe("private:test", {
            onPublication: () => {},
            onError,
        });

        expect(unsubscribe).toBeTypeOf("function");
        expect(onError).not.toHaveBeenCalled();

        await Promise.resolve();

        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "private:test",
            type: "auth",
            error: {
                message:
                    'Cannot subscribe to private channel "private:test" without authentication',
            },
        });
        expect(onError.mock.calls[0]?.[0].error).toBeInstanceOf(AuthenticationError);
        expect(client.activeChannels).toBe(0);
        expect(client.totalConsumers).toBe(0);
        expect(centrifugeState.instances).toHaveLength(0);

        expect(unsubscribe()).toBeUndefined();
        expect(unsubscribe()).toBeUndefined();
    });

    it("throws missing authentication when no error observer exists", () => {
        const client = createPublicRealtimeClient();

        expect(() =>
            client.subscribe("private:test", {
                onPublication: () => {},
            }),
        ).toThrow(AuthenticationError);

        expect(client.activeChannels).toBe(0);
        expect(client.totalConsumers).toBe(0);
        expect(centrifugeState.instances).toHaveLength(0);
    });

    it("makes unsubscribe handles idempotent", async () => {
        const client = createPublicRealtimeClient();
        const unsubscribe = client.subscribe("public:test", { onPublication: () => {} });
        const instance = firstInstance();
        const subscription = firstSubscription(instance);

        expect(client.activeChannels).toBe(1);
        expect(client.totalConsumers).toBe(1);

        unsubscribe();
        unsubscribe();

        expect(client.activeChannels).toBe(0);
        expect(client.totalConsumers).toBe(0);

        await waitForAsyncTokens();

        expect(subscription.unsubscribeCalls).toBe(1);
        expect(instance.removedSubscriptions).toEqual([subscription]);
        expect(instance.disconnectCalls).toBe(1);
    });

    it("ignores unsubscribe handles after disconnect", async () => {
        const client = createPublicRealtimeClient();
        const unsubscribe = client.subscribe("public:test", { onPublication: () => {} });
        const instance = firstInstance();
        const subscription = firstSubscription(instance);

        client.disconnect();
        unsubscribe();
        unsubscribe();

        await waitForAsyncTokens();

        expect(client.isConnected).toBe(false);
        expect(client.activeChannels).toBe(0);
        expect(client.totalConsumers).toBe(0);
        expect(subscription.unsubscribeCalls).toBe(0);
        expect(instance.removedSubscriptions).toHaveLength(0);
        expect(instance.disconnectCalls).toBe(1);
    });

    it("keeps a re-subscribed channel alive when an old unsubscribe handle is called again before teardown", async () => {
        const client = createPublicRealtimeClient();
        const firstUnsubscribe = client.subscribe("public:test", { onPublication: () => {} });
        const instance = firstInstance();
        const subscription = firstSubscription(instance);

        firstUnsubscribe();
        const secondUnsubscribe = client.subscribe("public:test", { onPublication: () => {} });

        expect(instance.subscriptions).toHaveLength(1);
        expect(client.isConnected).toBe(true);
        expect(client.activeChannels).toBe(1);
        expect(client.totalConsumers).toBe(1);

        firstUnsubscribe();
        await waitForAsyncTokens();

        expect(subscription.unsubscribeCalls).toBe(0);
        expect(instance.removedSubscriptions).toHaveLength(0);
        expect(instance.disconnectCalls).toBe(0);
        expect(client.isConnected).toBe(true);
        expect(client.activeChannels).toBe(1);
        expect(client.totalConsumers).toBe(1);

        secondUnsubscribe();
        await waitForAsyncTokens();

        expect(subscription.unsubscribeCalls).toBe(1);
        expect(instance.removedSubscriptions).toEqual([subscription]);
        expect(instance.disconnectCalls).toBe(1);
    });

    it("does not manually reconnect when Centrifuge reports a disconnect", () => {
        const client = createPublicRealtimeClient();
        client.subscribe("public:test", { onPublication: () => {} });
        const instance = firstInstance();

        expect(instance.connectCalls).toBe(1);

        instance.emit("disconnected");

        expect(instance.connectCalls).toBe(1);
    });

    it("keeps public and private subscriptions on stable clients", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
            const url = String(input);
            const token = url.includes("/subscribe") ? "subscription-token" : "connection-token";
            return Promise.resolve(
                new Response(JSON.stringify({ token }), {
                    headers: { "content-type": "application/json" },
                    status: 200,
                }),
            );
        });
        let hasAuth = false;
        const client = new RealtimeClient({
            wsUrl: "wss://stream.example.test",
            tokenEndpoint: "https://api.example.test/v1/rt/token",
            subscribeEndpoint: "https://api.example.test/v1/rt/subscribe",
            getAuthHeaders: () => ({ authorization: "Bearer upgraded-token" }),
            hasAuth: () => hasAuth,
        });
        const onPublicPublication = vi.fn();
        const onPrivatePublication = vi.fn();

        client.subscribe("public:test", { onPublication: onPublicPublication });
        const publicInstance = firstInstance();
        const publicSubscription = firstSubscription(publicInstance);

        hasAuth = true;
        client.subscribe("private:test", { onPublication: onPrivatePublication });
        await waitForAsyncTokens();

        expect(centrifugeState.instances).toHaveLength(2);
        expect(publicInstance.disconnectCalls).toBe(0);
        const authenticatedInstance = centrifugeState.instances[1];
        expect(publicInstance.subscriptions.map((sub) => sub.channel)).toEqual(["public:test"]);
        expect(authenticatedInstance?.subscriptions.map((sub) => sub.channel)).toEqual([
            "private:test",
        ]);
        expect(client.activeChannels).toBe(2);
        expect(client.totalConsumers).toBe(2);

        publicSubscription.emit("publication", { data: "still-public" });

        expect(onPublicPublication).toHaveBeenCalledTimes(1);
        expect(onPublicPublication).toHaveBeenCalledWith("still-public");
        expect(onPrivatePublication).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("disconnects only the idle client when mixed public and private subscriptions unsubscribe", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(() =>
            Promise.resolve(
                new Response(JSON.stringify({ token: "rt-token" }), {
                    headers: { "content-type": "application/json" },
                    status: 200,
                }),
            ),
        );
        const client = new RealtimeClient({
            wsUrl: "wss://stream.example.test",
            tokenEndpoint: "https://api.example.test/v1/rt/token",
            subscribeEndpoint: "https://api.example.test/v1/rt/subscribe",
            getAuthHeaders: () => ({ authorization: "Bearer scoped-token" }),
            hasAuth: () => true,
        });

        const unsubscribePublic = client.subscribe("public:test", { onPublication: () => {} });
        const publicInstance = firstInstance();
        const unsubscribePrivate = client.subscribe("private:test", { onPublication: () => {} });
        const privateInstance = centrifugeState.instances[1];
        if (!privateInstance) throw new Error("Expected authenticated realtime client");

        unsubscribePublic();
        await waitForAsyncTokens();

        expect(publicInstance.disconnectCalls).toBe(1);
        expect(privateInstance.disconnectCalls).toBe(0);
        expect(client.isConnected).toBe(true);
        expect(client.activeChannels).toBe(1);

        unsubscribePrivate();
        await waitForAsyncTokens();

        expect(privateInstance.disconnectCalls).toBe(1);
        expect(client.isConnected).toBe(false);
        expect(client.activeChannels).toBe(0);
    });

    it("disconnects private realtime state without touching public subscriptions", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(() =>
            Promise.resolve(
                new Response(JSON.stringify({ token: "rt-token" }), {
                    headers: { "content-type": "application/json" },
                    status: 200,
                }),
            ),
        );
        const onPublicPublication = vi.fn();
        const onPrivatePublication = vi.fn();
        const client = new RealtimeClient({
            wsUrl: "wss://stream.example.test",
            tokenEndpoint: "https://api.example.test/v1/rt/token",
            subscribeEndpoint: "https://api.example.test/v1/rt/subscribe",
            getAuthHeaders: () => ({ authorization: "Bearer scoped-token" }),
            hasAuth: () => true,
        });

        client.subscribe("public:test", { onPublication: onPublicPublication });
        const publicInstance = firstInstance();
        const publicSubscription = firstSubscription(publicInstance);
        client.subscribe("private:test", { onPublication: onPrivatePublication });
        const privateInstance = centrifugeState.instances[1];
        if (!privateInstance) throw new Error("Expected authenticated realtime client");
        const privateSubscription = firstSubscription(privateInstance);

        client.disconnectPrivate();

        expect(publicInstance.disconnectCalls).toBe(0);
        expect(privateInstance.disconnectCalls).toBe(1);
        expect(client.isConnected).toBe(true);
        expect(client.activeChannels).toBe(1);

        publicSubscription.emit("publication", { data: "public-after-private-disconnect" });
        privateSubscription.emit("publication", { data: "private-after-disconnect" });

        expect(onPublicPublication).toHaveBeenCalledWith("public-after-private-disconnect");
        expect(onPrivatePublication).not.toHaveBeenCalled();
    });

    it("reports malformed protobuf frames through onError", () => {
        const client = createPublicRealtimeClient();
        const onPublication = vi.fn();
        const onError = vi.fn();

        client.connectProtoChannel({
            channel: "public:test:proto",
            schema: OrderSchema,
            onPublication,
            onError,
        });
        const subscription = firstSubscription();

        expect(() =>
            subscription.emit("publication", { data: new Uint8Array([0xff]) }),
        ).not.toThrow();

        expect(onPublication).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        const errorCtx = onError.mock.calls[0]?.[0];
        expect(errorCtx).toMatchObject({
            channel: "public:test:proto",
            type: "decode",
        });
        expect(errorCtx?.error.message).toBe("premature EOF");
    });

    it("notifies consumers for the initial subscription and each recovered subscription epoch", async () => {
        const client = createPublicRealtimeClient();
        const onConnected = vi.fn();
        const onDisconnected = vi.fn();

        client.connectProtoChannel({
            channel: "public:test:proto",
            schema: OrderSchema,
            onPublication: vi.fn(),
            onConnected,
            onDisconnected,
        });
        const subscription = firstSubscription();
        await waitForAsyncTokens();

        expect(onConnected).toHaveBeenCalledOnce();

        subscription.state = "subscribing";
        subscription.state = "subscribed";
        subscription.emit("subscribed");

        expect(onConnected).toHaveBeenCalledTimes(2);
        expect(onDisconnected).not.toHaveBeenCalled();
    });

    it("does not report readiness until the channel subscription is confirmed", async () => {
        const client = createPublicRealtimeClient();
        const onSubscribed = vi.fn();

        client.subscribe("public:test", {
            onPublication: vi.fn(),
            onSubscribed,
        });
        const subscription = firstSubscription();
        subscription.state = "subscribing";

        await waitForAsyncTokens();

        expect(onSubscribed).not.toHaveBeenCalled();

        subscription.state = "subscribed";
        subscription.emit("subscribed");

        expect(onSubscribed).toHaveBeenCalledOnce();
    });

    it("delivers a subscribed epoch once when a consumer adds another consumer", async () => {
        const client = createPublicRealtimeClient();
        const secondOnSubscribed = vi.fn();
        let unsubscribeSecond: (() => void) | undefined;
        const firstOnSubscribed = vi.fn(() => {
            unsubscribeSecond ??= client.subscribe("public:test", {
                onPublication: vi.fn(),
                onSubscribed: secondOnSubscribed,
            });
        });
        const unsubscribeFirst = client.subscribe("public:test", {
            onPublication: vi.fn(),
            onSubscribed: firstOnSubscribed,
        });
        const subscription = firstSubscription();

        subscription.state = "subscribing";
        subscription.state = "subscribed";
        subscription.emit("subscribed");
        await waitForAsyncTokens();

        expect(firstOnSubscribed).toHaveBeenCalledOnce();
        expect(secondOnSubscribed).toHaveBeenCalledOnce();

        unsubscribeSecond?.();
        unsubscribeFirst();
    });

    it("isolates throwing publication handlers and reports the exception", () => {
        const client = createPublicRealtimeClient();
        const handlerError = new Error("consumer failed");
        const firstOnError = vi.fn();
        const secondOnPublication = vi.fn();

        client.subscribe("public:test", {
            onPublication: () => {
                throw handlerError;
            },
            onError: firstOnError,
        });
        client.subscribe("public:test", {
            onPublication: secondOnPublication,
        });
        const subscription = firstSubscription();

        expect(() => subscription.emit("publication", { data: "payload" })).not.toThrow();

        expect(secondOnPublication).toHaveBeenCalledWith("payload");
        expect(firstOnError).toHaveBeenCalledTimes(1);
        expect(firstOnError.mock.calls[0]?.[0]).toEqual({
            channel: "public:test",
            type: "publication_handler",
            error: handlerError,
        });
    });

    it("uses configured token endpoints and headers for private subscriptions", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
            Promise.resolve(
                new Response(JSON.stringify({ token: "rt-token" }), {
                    headers: { "content-type": "application/json" },
                    status: 200,
                }),
            ),
        );
        const authRequests: Array<{ url: string; method: string }> = [];
        const client = new RealtimeClient({
            wsUrl: "wss://stream.example.test",
            tokenEndpoint: "https://api.example.test/v1/rt/token",
            subscribeEndpoint: "https://api.example.test/custom/subscribe?existing=1",
            getAuthHeaders: (request) => {
                authRequests.push({ url: String(request.url), method: request.method });
                return { authorization: "Bearer scoped-token" };
            },
            hasAuth: () => true,
        });

        const unsubscribe = client.connectProtoChannel({
            channel: "private:test:orders:proto",
            schema: undefined as never,
            onPublication: () => {},
        });
        await waitForAsyncTokens();
        unsubscribe();

        expect(centrifugeState.instances).toHaveLength(1);
        expect(centrifugeState.instances[0]?.wsUrl).toBe("wss://stream.example.test");

        const calls = fetchMock.mock.calls.map(([input, init]) => ({
            url: String(input),
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            redirect: init?.redirect,
        }));
        expect(calls[0]).toEqual({
            url: "https://api.example.test/v1/rt/token",
            headers: { authorization: "Bearer scoped-token" },
            redirect: "manual",
        });

        const subscribeCall = calls[1];
        expect(subscribeCall?.headers).toEqual({ authorization: "Bearer scoped-token" });
        expect(subscribeCall?.redirect).toBe("manual");
        const subscribeUrl = new URL(subscribeCall?.url ?? "");
        expect(subscribeUrl.origin).toBe("https://api.example.test");
        expect(subscribeUrl.pathname).toBe("/custom/subscribe");
        expect(subscribeUrl.searchParams.get("existing")).toBe("1");
        expect(subscribeUrl.searchParams.get("channel")).toBe("private:test:orders:proto");
        expect(authRequests).toEqual([
            { url: "https://api.example.test/v1/rt/token", method: "GET" },
            {
                url: "https://api.example.test/custom/subscribe?existing=1&channel=private%3Atest%3Aorders%3Aproto",
                method: "GET",
            },
        ]);
    });

    it("reports connection token failures to private subscription error handlers", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
            const url = String(input);
            if (url.endsWith("/v1/rt/token")) {
                return Promise.resolve(new Response(null, { status: 500 }));
            }
            return Promise.resolve(
                new Response(JSON.stringify({ token: "subscription-token" }), {
                    headers: { "content-type": "application/json" },
                    status: 200,
                }),
            );
        });
        const onError = vi.fn();
        const client = new RealtimeClient({
            wsUrl: "wss://stream.example.test",
            tokenEndpoint: "https://api.example.test/v1/rt/token",
            subscribeEndpoint: "https://api.example.test/v1/rt/subscribe",
            getAuthHeaders: () => ({ authorization: "Bearer scoped-token" }),
            hasAuth: () => true,
        });

        client.subscribe("private:test", {
            onPublication: () => {},
            onError,
        });
        const instance = firstInstance();

        await expect(instance.tokenPromise).rejects.toThrow(
            "Failed to fetch connection token: 500",
        );
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "private:test",
            type: "connection_token",
        });
        expect(onError.mock.calls[0]?.[0].error.message).toBe(
            "Failed to fetch connection token: 500",
        );
    });

    it("reports subscription token failures to that channel error handler", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
            const url = String(input);
            if (url.includes("/v1/rt/subscribe")) {
                return Promise.resolve(new Response(null, { status: 500 }));
            }
            return Promise.resolve(
                new Response(JSON.stringify({ token: "connection-token" }), {
                    headers: { "content-type": "application/json" },
                    status: 200,
                }),
            );
        });
        const onError = vi.fn();
        const client = new RealtimeClient({
            wsUrl: "wss://stream.example.test",
            tokenEndpoint: "https://api.example.test/v1/rt/token",
            subscribeEndpoint: "https://api.example.test/v1/rt/subscribe",
            getAuthHeaders: () => ({ authorization: "Bearer scoped-token" }),
            hasAuth: () => true,
        });

        client.subscribe("private:test", {
            onPublication: () => {},
            onError,
        });
        const subscription = firstSubscription();

        await expect(subscription.tokenPromise).rejects.toThrow(
            "Failed to fetch subscription token: 500",
        );
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "private:test",
            type: "subscription_token",
        });
        expect(onError.mock.calls[0]?.[0].error.message).toBe(
            "Failed to fetch subscription token: 500",
        );
    });

    it("keeps realtime state scoped to each client instance", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
            Promise.resolve(
                new Response(JSON.stringify({ token: "rt-token" }), {
                    headers: { "content-type": "application/json" },
                    status: 200,
                }),
            ),
        );
        const first = new RealtimeClient({
            wsUrl: "wss://one.example.test",
            tokenEndpoint: "https://one.example.test/v1/rt/token",
            subscribeEndpoint: "https://one.example.test/v1/rt/subscribe",
            getAuthHeaders: () => ({ authorization: "Bearer one" }),
            hasAuth: () => true,
        });
        const second = new RealtimeClient({
            wsUrl: "wss://two.example.test",
            tokenEndpoint: "https://two.example.test/v1/rt/token",
            subscribeEndpoint: "https://two.example.test/v1/rt/subscribe",
            getAuthHeaders: () => ({ authorization: "Bearer two" }),
            hasAuth: () => true,
        });

        const unsubscribeFirst = first.connectProtoChannel({
            channel: "private:first:proto",
            schema: undefined as never,
            onPublication: () => {},
        });
        const unsubscribeSecond = second.connectProtoChannel({
            channel: "private:second:proto",
            schema: undefined as never,
            onPublication: () => {},
        });
        await waitForAsyncTokens();
        unsubscribeFirst();
        unsubscribeSecond();

        expect(centrifugeState.instances.map((instance) => instance.wsUrl)).toEqual([
            "wss://one.example.test",
            "wss://two.example.test",
        ]);
        expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
            "https://one.example.test/v1/rt/token",
            "https://one.example.test/v1/rt/subscribe?channel=private%3Afirst%3Aproto",
            "https://two.example.test/v1/rt/token",
            "https://two.example.test/v1/rt/subscribe?channel=private%3Asecond%3Aproto",
        ]);
    });
});
