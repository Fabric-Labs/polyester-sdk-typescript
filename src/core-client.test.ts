import { afterEach, describe, expect, it, vi } from "vitest";
import { signAsync } from "@noble/ed25519";
import { POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";
import { createTestCatalog } from "./testing/catalog.js";
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

import { PolyesterClient } from "./core-client.js";
import { AuthenticationError, ConfigurationError } from "./shared/errors.js";

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("PolyesterClient configuration", () => {
    it("rejects a missing environment with an SDK configuration error", () => {
        expect(() => new PolyesterClient({} as never)).toThrow(ConfigurationError);
        expect(() => new PolyesterClient({} as never)).toThrow("environment must be an object.");
    });

    it("rejects an incomplete environment before constructing transports", () => {
        expect(
            () =>
                new PolyesterClient({
                    environment: {
                        apiUrl: "https://api.example.test",
                        websocketUrl: "wss://api.example.test",
                        fingerprint: "0xfingerprint",
                    },
                } as never),
        ).toThrow(ConfigurationError);
        expect(
            () =>
                new PolyesterClient({
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
                new PolyesterClient({
                    environment: POLYESTER_TESTNET_ENVIRONMENT,
                    wireFormat,
                } as never),
        ).toThrow('wireFormat must be either "binary" or "json".');
    });

    it("rejects providing both catalog and catalogSnapshot", () => {
        const catalog = createTestCatalog();

        expect(
            () =>
                // @ts-expect-error catalog and catalogSnapshot are mutually exclusive
                new PolyesterClient({
                    environment: POLYESTER_TESTNET_ENVIRONMENT,
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

        const client = new PolyesterClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
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
            url: `${POLYESTER_TESTNET_ENVIRONMENT.apiUrl}/v1/rt/subscribe?channel=private:spot:orders:acct-1:proto`,
            method: "GET",
        });
        const emptyHash = await crypto.subtle.digest("SHA-256", new Uint8Array(0));
        const canonical = `1234567890\nGET\n/v1/rt/subscribe\nchannel=private%3Aspot%3Aorders%3Aacct-1%3Aproto\n${bytesToHex(
            new Uint8Array(emptyHash),
        )}`;
        const expectedSignature = bytesToHex(
            await signAsync(new TextEncoder().encode(canonical), secretKey),
        );

        expect(config.hasAuth?.()).toBe(true);
        expect(headers).toEqual({
            "X-API-KEY-ID": "ak_test",
            "X-API-TIMESTAMP": "1234567890",
            "X-API-SIGNATURE": expectedSignature,
        });
    });

    it("maps realtime JWT provider failures without resolving credentials from hasAuth", async () => {
        const cause = new Error("credential store unavailable");
        const getToken = vi.fn(() => {
            throw cause;
        });
        const client = new PolyesterClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            auth: { kind: "jwt", getToken },
        });
        void client.realtime;

        const config = realtimeConfigs[0];
        if (!config?.getAuthHeaders) throw new Error("Expected realtime auth headers");

        expect(config.hasAuth?.()).toBe(true);
        expect(getToken).not.toHaveBeenCalled();
        let rejection: unknown;
        try {
            await config.getAuthHeaders({
                url: `${POLYESTER_TESTNET_ENVIRONMENT.apiUrl}/v1/rt/token`,
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
        expect(getToken).toHaveBeenCalledOnce();
    });

    it("accepts a missing realtime JWT credential without calling the provider twice", async () => {
        const getToken = vi.fn(() => null);
        const client = new PolyesterClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            auth: { kind: "jwt", getToken },
        });
        void client.realtime;

        const config = realtimeConfigs[0];
        if (!config?.getAuthHeaders) throw new Error("Expected realtime auth headers");

        expect(config.hasAuth?.()).toBe(true);
        expect(getToken).not.toHaveBeenCalled();
        await expect(
            config.getAuthHeaders({
                url: `${POLYESTER_TESTNET_ENVIRONMENT.apiUrl}/v1/rt/token`,
                method: "GET",
            }),
        ).resolves.toEqual({});
        expect(getToken).toHaveBeenCalledOnce();
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

        new PolyesterClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            catalog,
        });

        expect(refresh).not.toHaveBeenCalled();
    });

    it("accepts catalogSnapshot and catalogCell together", () => {
        const snapshot = createTestCatalog().snapshot();
        let current: CatalogSnapshot | undefined;
        const client = new PolyesterClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
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
