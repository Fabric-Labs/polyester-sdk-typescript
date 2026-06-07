import { afterEach, describe, expect, it, vi } from "vitest";

const centrifugeState = {
    instances: [] as Array<{
        wsUrl: string;
        opts: { getToken?: () => Promise<string> };
        subscriptions: Array<{
            channel: string;
            opts?: { getToken?: () => Promise<string> };
        }>;
    }>,
};

vi.mock("centrifuge/build/protobuf", () => {
    class MockCentrifuge {
        subscriptions: Array<{
            channel: string;
            opts?: { getToken?: () => Promise<string> };
        }> = [];

        constructor(
            readonly wsUrl: string,
            readonly opts: { getToken?: () => Promise<string> },
        ) {
            centrifugeState.instances.push(this);
        }

        on(): void {}

        connect(): void {
            void this.opts.getToken?.();
        }

        newSubscription(channel: string, opts?: { getToken?: () => Promise<string> }) {
            this.subscriptions.push({ channel, opts });
            return {
                state: "unsubscribed",
                on: () => {},
                subscribe: () => {
                    void opts?.getToken?.();
                },
                unsubscribe: () => {},
            };
        }

        removeSubscription(): void {}

        disconnect(): void {}
    }

    return { Centrifuge: MockCentrifuge };
});

import { RealtimeClient } from "./client.js";

async function waitForAsyncTokens(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe("RealtimeClient", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        centrifugeState.instances.length = 0;
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
            headers: init?.headers,
        }));
        expect(calls[0]).toEqual({
            url: "https://api.example.test/v1/rt/token",
            headers: { authorization: "Bearer scoped-token" },
        });

        const subscribeCall = calls[1];
        expect(subscribeCall?.headers).toEqual({ authorization: "Bearer scoped-token" });
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
