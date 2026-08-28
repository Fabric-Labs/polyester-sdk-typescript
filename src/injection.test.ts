import { describe, expect, it, vi } from "vitest";
import type { Transport } from "@connectrpc/connect";
import { POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";
import { PolyesterClient } from "./core-client.js";
import { RealtimeClient } from "./realtime/client.js";
import type { PolyesterRealtime } from "./realtime/types.js";

function stubTransport(): Transport {
    return {
        unary: vi.fn(async () => {
            throw new Error("unary not stubbed");
        }),
        stream: vi.fn(),
    } as unknown as Transport;
}

function stubRealtime(): PolyesterRealtime {
    return {
        subscribe: vi.fn(() => () => {}),
        connectChannel: vi.fn(() => () => {}),
        connectProtoChannel: vi.fn(() => () => {}),
        disconnect: vi.fn(),
        disconnectPrivate: vi.fn(),
        isConnected: false,
        activeChannels: 0,
        totalConsumers: 0,
    };
}

describe("PolyesterClient injection hooks", () => {
    it("uses injected transports and realtime client without constructing its own", async () => {
        const publicApi = stubTransport();
        const authApi = stubTransport();
        const realtimeClient = stubRealtime();
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);

        try {
            const client = new PolyesterClient({
                environment: POLYESTER_TESTNET_ENVIRONMENT,
                transports: { publicApi, authApi },
                realtimeClient,
            });

            expect(client.realtime).toBe(realtimeClient);

            // Public-transport service calls hit the injected transport.
            await expect(client.marketData.getSpotConfig()).rejects.toThrow("unary not stubbed");
            expect(publicApi.unary).toHaveBeenCalledTimes(1);

            // No network traffic from construction or the failed call.
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("routes realtime subscriptions through the injected implementation", () => {
        const realtimeClient = stubRealtime();
        const client = new PolyesterClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            transports: { publicApi: stubTransport(), authApi: stubTransport() },
            realtimeClient,
        });

        const unsubscribe = client.realtime.subscribe("public:test", {
            onPublication: () => {},
        });
        unsubscribe();
        expect(realtimeClient.subscribe).toHaveBeenCalledWith(
            "public:test",
            expect.objectContaining({ onPublication: expect.any(Function) }),
        );
    });

    it("routes the public subaccount role catalog through the public transport", async () => {
        const publicApi = stubTransport();
        const authApi = stubTransport();
        const client = new PolyesterClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            transports: { publicApi, authApi },
            realtimeClient: stubRealtime(),
        });

        await expect(client.subaccounts.listRoles()).rejects.toThrow("unary not stubbed");

        expect(publicApi.unary).toHaveBeenCalledOnce();
        expect(authApi.unary).not.toHaveBeenCalled();
    });

    it("RealtimeClient satisfies the PolyesterRealtime interface", () => {
        const realtime: PolyesterRealtime = new RealtimeClient({
            wsUrl: "wss://example.invalid/ws",
            tokenEndpoint: "https://example.invalid/token",
            subscribeEndpoint: "https://example.invalid/subscribe",
        });
        expect(realtime.isConnected).toBe(false);
        expect(realtime.activeChannels).toBe(0);
    });
});
