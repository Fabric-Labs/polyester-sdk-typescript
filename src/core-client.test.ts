import { afterEach, describe, expect, it, vi } from "vitest";
import { signAsync } from "@noble/ed25519";
import { POLYESTER_DEVNET_ENVIRONMENT } from "./environment.js";
import { createTestCatalog } from "./testing/catalog.js";
import { unaryTransport } from "./testing/service-harness.js";
import { DailyClaimState } from "./gen/claims/v1/claims_pb.js";
import type { CatalogSnapshot } from "./catalogs/index.js";

type RealtimeAuthRequest = {
    url: string | URL;
    method: string;
};

type CapturedRealtimeConfig = {
    wsUrl: string;
    tokenEndpoint: string;
    subscribeEndpoint: string;
    getAuthHeaders?: (request: RealtimeAuthRequest) => Promise<HeadersInit> | HeadersInit;
    hasAuth?: () => boolean;
};

const { realtimeConfigs } = vi.hoisted(() => ({
    realtimeConfigs: [] as CapturedRealtimeConfig[],
}));

vi.mock("./realtime/index.js", () => ({
    RealtimeClient: class MockRealtimeClient {
        constructor(config: CapturedRealtimeConfig) {
            realtimeConfigs.push(config);
        }
    },
}));

import { PolyesterClient } from "./client.js";
import { PolyesterCore } from "./core-client.js";
import { claimsService } from "./services/claims/service.js";

import { AuthenticationError, ConfigurationError } from "./shared/errors.js";

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// The full client and the tree-shakable core share one implementation; every
// behavior here must hold for both.
describe.each([
    ["PolyesterClient", PolyesterClient],
    ["PolyesterCore", PolyesterCore],
] as const)("%s", (_name, Client) => {
    describe("PolyesterClient configuration", () => {
        it("rejects a missing environment with an SDK configuration error", () => {
            expect(() => new Client({} as never)).toThrow(ConfigurationError);
            expect(() => new Client({} as never)).toThrow("environment must be an object.");
        });

        it("rejects an incomplete environment before constructing transports", () => {
            expect(
                () =>
                    new Client({
                        environment: {
                            apiUrl: "https://api.example.test",
                            websocketUrl: "wss://api.example.test",
                            fingerprint: "0xfingerprint",
                        },
                    } as never),
            ).toThrow(ConfigurationError);
            expect(
                () =>
                    new Client({
                        environment: {
                            apiUrl: "https://api.example.test",
                            websocketUrl: "wss://api.example.test",
                            fingerprint: "0xfingerprint",
                        },
                    } as never),
            ).toThrow("name must be a non-empty string.");
        });

        it.each(["xml", 42])("rejects unsupported wire format %j", (wireFormat) => {
            expect(
                () =>
                    new Client({
                        environment: POLYESTER_DEVNET_ENVIRONMENT,
                        wireFormat,
                    } as never),
            ).toThrow('wireFormat must be either "binary" or "json".');
        });

        it("rejects a non-function fetch", () => {
            expect(
                () =>
                    new Client({
                        environment: POLYESTER_DEVNET_ENVIRONMENT,
                        fetch: "fetch",
                    } as never),
            ).toThrow("fetch must be a function.");
        });

        it("rejects providing both catalog and catalogSnapshot", () => {
            const catalog = createTestCatalog();

            expect(
                () =>
                    // @ts-expect-error catalog and catalogSnapshot are mutually exclusive
                    new Client({
                        environment: POLYESTER_DEVNET_ENVIRONMENT,
                        catalog,
                        catalogSnapshot: catalog.snapshot(),
                    }),
            ).toThrow("Provide either catalog or catalogSnapshot, not both.");
        });
    });

    describe("PolyesterClient realtime auth", () => {
        afterEach(() => {
            vi.restoreAllMocks();
            realtimeConfigs.length = 0;
        });

        it("uses API-key auth headers for realtime token requests", async () => {
            vi.spyOn(Date, "now").mockReturnValue(1234567890);
            const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

            const client = new Client({
                environment: POLYESTER_DEVNET_ENVIRONMENT,
                auth: {
                    kind: "api-key-ed25519",
                    getKeyId: () => "ak_test",
                    getSecretKey: () => secretKey,
                },
            });
            // Services and the realtime client are constructed lazily; first access
            // materializes the RealtimeClient with its auth config.
            void client.realtime;

            const config = realtimeConfigs[0];
            if (!config?.getAuthHeaders) throw new Error("Expected realtime auth headers");

            const headers = await config.getAuthHeaders({
                url: `${POLYESTER_DEVNET_ENVIRONMENT.apiUrl}/v1/rt/subscribe?channel=private:spot:orders:acct-1:proto`,
                method: "GET",
            });
            // Signing timestamps are monotonic per process, so a clock pinned by an
            // earlier test can advance this one past the mocked value.
            const timestamp = (headers as Record<string, string>)["X-API-TIMESTAMP"]!;
            expect(Number(timestamp)).toBeGreaterThanOrEqual(1234567890);
            const emptyHash = await crypto.subtle.digest("SHA-256", new Uint8Array(0));
            const canonical = `${timestamp}\nGET\n/v1/rt/subscribe\nchannel=private%3Aspot%3Aorders%3Aacct-1%3Aproto\n${bytesToHex(
                new Uint8Array(emptyHash),
            )}`;
            const expectedSignature = bytesToHex(
                await signAsync(new TextEncoder().encode(canonical), secretKey),
            );

            expect(config.hasAuth?.()).toBe(true);
            expect(headers).toEqual({
                "X-API-KEY-ID": "ak_test",
                "X-API-TIMESTAMP": timestamp,
                "X-API-SIGNATURE": expectedSignature,
            });
        });

        it.each(["synchronous", "asynchronous"])(
            "maps a %s realtime JWT provider failure to AuthenticationError",
            async (provider) => {
                const cause = new Error("credential store unavailable");
                const getToken = vi.fn(() => {
                    if (provider === "asynchronous") return Promise.reject(cause);
                    throw cause;
                });
                const client = new Client({
                    environment: POLYESTER_DEVNET_ENVIRONMENT,
                    auth: { kind: "jwt", getToken },
                });
                void client.realtime;

                const config = realtimeConfigs[0];
                if (!config?.getAuthHeaders) throw new Error("Expected realtime auth headers");

                expect(config.hasAuth?.()).toBe(true);
                expect(getToken).toHaveBeenCalledOnce();
                let rejection: unknown;
                try {
                    await config.getAuthHeaders({
                        url: `${POLYESTER_DEVNET_ENVIRONMENT.apiUrl}/v1/rt/token`,
                        method: "GET",
                    });
                } catch (error) {
                    rejection = error;
                }
                expect(rejection).toBeInstanceOf(AuthenticationError);
                expect(rejection).toMatchObject({
                    name: "AuthenticationError",
                    code: "UNAUTHENTICATED",
                    cause,
                });
                expect(getToken).toHaveBeenCalledTimes(2);
            },
        );

        it("reports a synchronous missing realtime JWT credential during preflight", () => {
            const getToken = vi.fn(() => null);
            const client = new Client({
                environment: POLYESTER_DEVNET_ENVIRONMENT,
                auth: { kind: "jwt", getToken },
            });
            void client.realtime;

            const config = realtimeConfigs[0];
            if (!config?.getAuthHeaders) throw new Error("Expected realtime auth headers");

            expect(config.hasAuth?.()).toBe(false);
            expect(getToken).toHaveBeenCalledOnce();
        });

        it("reads the current synchronous realtime JWT credential for each request", async () => {
            const getToken = vi.fn(() => "secret").mockReturnValueOnce("old-secret");
            const client = new Client({
                environment: POLYESTER_DEVNET_ENVIRONMENT,
                auth: { kind: "jwt", getToken },
            });
            void client.realtime;

            const config = realtimeConfigs[0];
            if (!config?.getAuthHeaders) throw new Error("Expected realtime auth headers");

            expect(config.hasAuth?.()).toBe(true);
            expect(config.hasAuth?.()).toBe(true);
            await expect(
                config.getAuthHeaders({
                    url: `${POLYESTER_DEVNET_ENVIRONMENT.apiUrl}/v1/rt/token`,
                    method: "GET",
                }),
            ).resolves.toEqual({ authorization: "Bearer secret" });
            expect(getToken).toHaveBeenCalledTimes(3);
        });

        it("reads the current asynchronous realtime JWT credential for each request", async () => {
            const getToken = vi.fn(async () => "secret").mockResolvedValueOnce("old-secret");
            const client = new Client({
                environment: POLYESTER_DEVNET_ENVIRONMENT,
                auth: { kind: "jwt", getToken },
            });
            void client.realtime;

            const config = realtimeConfigs[0];
            if (!config?.getAuthHeaders) throw new Error("Expected realtime auth headers");

            expect(config.hasAuth?.()).toBe(true);
            await expect(
                config.getAuthHeaders({
                    url: `${POLYESTER_DEVNET_ENVIRONMENT.apiUrl}/v1/rt/token`,
                    method: "GET",
                }),
            ).resolves.toEqual({ authorization: "Bearer secret" });
            expect(getToken).toHaveBeenCalledTimes(2);
        });
    });

    describe("PolyesterClient catalog refresh", () => {
        afterEach(() => {
            vi.restoreAllMocks();
            realtimeConfigs.length = 0;
        });

        it("does not refresh injected catalogs during construction", () => {
            const catalog = createTestCatalog();
            const refresh = vi.spyOn(catalog, "refresh");

            new Client({
                environment: POLYESTER_DEVNET_ENVIRONMENT,
                catalog,
            });

            expect(refresh).not.toHaveBeenCalled();
        });

        it("accepts catalogSnapshot and catalogCell together", () => {
            const snapshot = createTestCatalog().snapshot();
            let current: CatalogSnapshot | undefined;
            const client = new Client({
                environment: POLYESTER_DEVNET_ENVIRONMENT,
                catalogSnapshot: snapshot,
                catalogCell: {
                    get: () => current,
                    set: (nextSnapshot) => {
                        current = nextSnapshot;
                    },
                },
            });

            expect(client.catalog.snapshot()).toBe(snapshot);
            expect(current).toBe(snapshot);
        });
    });

    describe("PolyesterClient claims", () => {
        it("routes claims through the authenticated transport without a catalog or realtime connection", async () => {
            const authApi = unaryTransport({
                state: DailyClaimState.CLAIM_UNAVAILABLE,
                rewards: [],
                claimId: "",
            });
            const publicApi = unaryTransport({});
            const client = new Client({
                environment: POLYESTER_DEVNET_ENVIRONMENT,
                transports: { authApi: authApi.transport, publicApi: publicApi.transport },
            });
            const realtimeCount = realtimeConfigs.length;
            const signal = new AbortController().signal;

            expect(claimsService(client)).toBe(claimsService(client));
            await claimsService(client).getDailyClaimStatus({ signal });

            expect(authApi.lastCall()?.method.parent.typeName).toBe("claims.v1.ClaimsService");
            expect(authApi.lastCall()?.method.localName).toBe("getDailyClaimStatus");
            expect(authApi.lastCall()?.signal).toBe(signal);
            expect(publicApi.calls).toHaveLength(0);
            expect(realtimeConfigs).toHaveLength(realtimeCount);
        });
    });
});
