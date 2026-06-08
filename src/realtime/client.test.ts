import { afterEach, describe, expect, it, vi } from "vitest";

type TokenOpts = { getToken?: () => Promise<string> };
type MockSubscriptionState = "subscribed" | "unsubscribed";
type MockEventHandler = (...args: unknown[]) => void;

interface MockSubscriptionRecord {
    channel: string;
    opts?: TokenOpts;
    state: MockSubscriptionState;
    subscribeCalls: number;
    unsubscribeCalls: number;
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
}

const centrifugeState = {
    instances: [] as MockCentrifugeRecord[],
};

vi.mock("centrifuge/build/protobuf", () => {
    class MockSubscription implements MockSubscriptionRecord {
        state: MockSubscriptionState = "unsubscribed";
        subscribeCalls = 0;
        unsubscribeCalls = 0;
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
            void this.opts?.getToken?.();
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

        constructor(
            readonly wsUrl: string,
            readonly opts: TokenOpts = {},
        ) {
            centrifugeState.instances.push(this);
        }

        on(): void {}

        connect(): void {
            this.connectCalls++;
            void this.opts.getToken?.();
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

    return { Centrifuge: MockCentrifuge };
});

import { RealtimeClient } from "./client.js";
import { OrderSchema } from "../gen/orders/v1/orders_read_pb.js";

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
    afterEach(() => {
        vi.restoreAllMocks();
        centrifugeState.instances.length = 0;
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
        expect(errorCtx?.error).toMatchObject({
            code: 0,
            message: expect.any(String),
        });
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
            error: {
                code: 0,
                message: handlerError.message,
            },
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
        const client = new RealtimeClient({
            wsUrl: "wss://stream.example.test",
            tokenEndpoint: "https://api.example.test/v1/rt/token",
            subscribeEndpoint: "https://api.example.test/custom/subscribe?existing=1",
            getAuthHeaders: () => ({ authorization: "Bearer scoped-token" }),
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
