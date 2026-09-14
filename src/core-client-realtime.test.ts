import { afterEach, describe, expect, it, vi } from "vitest";
import { PolyesterClient } from "./core-client.js";
import { POLYESTER_DEVNET_ENVIRONMENT } from "./environment.js";
import { __setRealtimeCentrifugeForTests } from "./realtime/client.js";
import { AuthenticationError } from "./shared/errors.js";

type TokenOptions = { getToken: () => Promise<string> };

describe("PolyesterClient realtime authentication", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        __setRealtimeCentrifugeForTests(null);
    });

    it.each([
        ["synchronous", "connection"],
        ["synchronous", "subscription"],
        ["asynchronous", "connection"],
        ["asynchronous", "subscription"],
    ] as const)("uses current %s JWT credentials for %s refreshes", async (provider, refresh) => {
        const tokenRequests: Promise<string>[] = [];
        let connectionOptions: TokenOptions;
        let subscriptionOptions: TokenOptions;
        class MockCentrifuge {
            state = "connected";
            constructor(_url: string, options: TokenOptions) {
                connectionOptions = options;
            }
            on() {}
            connect() {
                tokenRequests.push(connectionOptions.getToken());
            }
            disconnect() {}
            newSubscription(_channel: string, options: TokenOptions) {
                subscriptionOptions = options;
                return {
                    state: "subscribed",
                    on() {},
                    subscribe() {
                        tokenRequests.push(options.getToken());
                    },
                    unsubscribe() {},
                };
            }
        }
        __setRealtimeCentrifugeForTests(
            MockCentrifuge as unknown as Parameters<typeof __setRealtimeCentrifugeForTests>[0],
        );
        const bearers: (string | null)[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: unknown, init?: RequestInit) => {
                bearers.push(new Headers(init?.headers).get("authorization"));
                return new Response(JSON.stringify({ token: "transport-token" }));
            }),
        );
        let jwt: string | null = "JWT-1";
        const client = new PolyesterClient({
            environment: POLYESTER_DEVNET_ENVIRONMENT,
            auth: {
                kind: "jwt",
                getToken: () => (provider === "asynchronous" ? Promise.resolve(jwt) : jwt),
            },
        });
        const subscribe = () =>
            client.realtime.subscribe("private:test", { onPublication: () => {} });
        try {
            subscribe();
            await Promise.all(tokenRequests);
            expect(bearers).toEqual(["Bearer JWT-1", "Bearer JWT-1"]);
            const refreshToken = () =>
                (refresh === "connection" ? connectionOptions : subscriptionOptions).getToken();
            subscribe();
            expect(tokenRequests).toHaveLength(2);
            jwt = "JWT-2";
            await refreshToken();
            expect(bearers.at(-1)).toBe("Bearer JWT-2");
            subscribe();
            jwt = null;
            await refreshToken();
            expect(bearers.at(-1)).toBeNull();
        } finally {
            client.realtime.disconnect();
        }
    });
    it("rejects a private subscription when a synchronous JWT provider returns null", () => {
        const getToken = vi.fn(() => null);
        const client = new PolyesterClient({
            environment: POLYESTER_DEVNET_ENVIRONMENT,
            auth: { kind: "jwt", getToken },
        });

        expect(() =>
            client.realtime.subscribe("private:test", {
                onPublication: () => {},
            }),
        ).toThrow(AuthenticationError);
        expect(getToken).toHaveBeenCalledOnce();
        expect(client.realtime.activeChannels).toBe(0);
        expect(client.realtime.totalConsumers).toBe(0);
    });
});
