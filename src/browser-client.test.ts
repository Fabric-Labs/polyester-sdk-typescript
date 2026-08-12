import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Interceptor } from "@connectrpc/connect";
import type { AccountSigner } from "./account-signer/index.js";
import { PolyesterBrowserClient } from "./browser-client.js";
import { POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";
import { AccountSignerAuthService } from "./services/auth/account-signer-auth.js";
import type { LoginWithWalletInput, LoginWithWalletResponse } from "./services/auth/auth.js";
import {
    POLYESTER_AUTH_TOKEN_COOKIE_NAME,
    POLYESTER_SESSION_COOKIE_NAME,
} from "./services/auth/cookie-constants.js";
import { parseServerSessionSnapshot } from "./services/auth/session.js";
import {
    createCookieAuthTokenStorage,
    type AuthTokenStorage,
} from "./services/auth/token-storage.js";
import { MarketDataService } from "./services/market-data/index.js";
import { ZipperService } from "./services/zipper/index.js";
import { createTestCatalog } from "./testing/catalog.js";
import type { CatalogSnapshot } from "./catalogs/index.js";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

function signer(accountAddress: AccountSigner["accountAddress"]): AccountSigner {
    return {
        environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        accountAddress,
        ownerAddress: "0x2222222222222222222222222222222222222222",
        signMessage: async () => "0xsignature",
    };
}

function base64UrlEncode(value: string): string {
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function jwtWithExp(exp: number): string {
    return ["header", base64UrlEncode(JSON.stringify({ exp })), "signature"].join(".");
}

function installCookieJar(): { jar: Map<string, string>; writes: string[] } {
    const jar = new Map<string, string>();
    const writes: string[] = [];
    const document = {};

    Object.defineProperty(document, "cookie", {
        configurable: true,
        get: () => Array.from(jar, ([name, value]) => `${name}=${value}`).join("; "),
        set: (value: string) => {
            writes.push(value);
            const [pair = "", ...attributes] = value.split(";");
            const separatorIndex = pair.indexOf("=");
            if (separatorIndex === -1) return;

            const name = pair.slice(0, separatorIndex);
            const cookieValue = pair.slice(separatorIndex + 1);
            const maxAge = attributes
                .map((attribute) => attribute.trim())
                .find((attribute) => attribute.toLowerCase().startsWith("max-age="));
            const expires = attributes
                .map((attribute) => attribute.trim())
                .find((attribute) => attribute.toLowerCase().startsWith("expires="));

            if (
                cookieValue === "" &&
                (maxAge?.toLowerCase() === "max-age=0" || expires?.includes("Thu, 01 Jan 1970"))
            ) {
                jar.delete(name);
                return;
            }

            jar.set(name, cookieValue);
        },
    });

    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: document,
        writable: true,
    });

    return { jar, writes };
}

function mockClientLogin(client: PolyesterBrowserClient, accessToken: string) {
    vi.spyOn(client.auth, "requestLoginNonce").mockResolvedValue({ nonce: "nonce-1" });
    return vi
        .spyOn(
            client.auth as unknown as {
                loginWithWallet(input: LoginWithWalletInput): Promise<LoginWithWalletResponse>;
            },
            "loginWithWallet",
        )
        .mockResolvedValue({
            accessToken,
            accountId: "account-1",
            username: "hunter",
            expiresAt: {
                seconds: 1n,
                nanos: 0,
            },
        });
}

function createTestStorage() {
    return {
        get: vi.fn(() => null),
        set: vi.fn(),
        clear: vi.fn(),
    } satisfies AuthTokenStorage;
}

function mockCatalogRefreshEndpoints(): {
    getSpotConfig: ReturnType<typeof vi.spyOn>;
    getDepositWithdrawConfig: ReturnType<typeof vi.spyOn>;
} {
    return {
        getSpotConfig: vi
            .spyOn(MarketDataService.prototype, "getSpotConfig")
            .mockResolvedValue({ assets: [], pairs: [], tsSec: 0 }),
        getDepositWithdrawConfig: vi
            .spyOn(ZipperService.prototype, "getDepositWithdrawConfig")
            .mockResolvedValue({
                chains: [],
                assets: [],
                polyesterChainId: 0,
                contracts: [],
                tsMs: 0,
            }),
    };
}

describe("PolyesterBrowserClient", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async () => {
        vi.useRealTimers();
        await new Promise((resolve) => setTimeout(resolve, 0));
        vi.restoreAllMocks();
        if (originalDocument) {
            Object.defineProperty(globalThis, "document", originalDocument);
        } else {
            Reflect.deleteProperty(globalThis, "document");
        }
    });

    it("accepts an accountSigner config", () => {
        const accountSigner = signer("0x1111111111111111111111111111111111111111");
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            accountSigner,
        });

        expect(client.auth).toBeInstanceOf(AccountSignerAuthService);
        expect(client.auth.getAccountSigner()).toBeNull();
    });

    it("does not refresh catalogs during construction", () => {
        const refresh = mockCatalogRefreshEndpoints();

        new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });

        expect(refresh.getSpotConfig).not.toHaveBeenCalled();
        expect(refresh.getDepositWithdrawConfig).not.toHaveBeenCalled();
    });

    it("uses an injected catalog without starting runtime refresh", () => {
        const refresh = mockCatalogRefreshEndpoints();
        const catalog = createTestCatalog();

        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            catalog,
        });

        expect(client.catalog).toBe(catalog);
        expect(refresh.getSpotConfig).not.toHaveBeenCalled();
        expect(refresh.getDepositWithdrawConfig).not.toHaveBeenCalled();
    });

    it("rejects providing both catalog and catalogCell", () => {
        const catalog = createTestCatalog();

        expect(
            () =>
                new PolyesterBrowserClient({
                    environment: POLYESTER_TESTNET_ENVIRONMENT,
                    catalog,
                    catalogCell: { get: () => undefined, set: () => {} },
                }),
        ).toThrow("Provide either catalog or catalogCell, not both.");
    });

    it("routes the client-built catalog through an injected catalogCell", async () => {
        mockCatalogRefreshEndpoints();
        let current: CatalogSnapshot | undefined;
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            catalogCell: {
                get: () => current,
                set: (snapshot) => {
                    current = snapshot;
                },
            },
        });

        const refreshed = await client.catalog.refresh();

        expect(current).toBe(refreshed);
        expect(client.catalog.snapshot()).toBe(refreshed);
    });

    it("refreshes catalogs explicitly", async () => {
        const refresh = mockCatalogRefreshEndpoints();
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });

        await client.catalog.refresh();

        expect(refresh.getSpotConfig).toHaveBeenCalledTimes(1);
        expect(refresh.getDepositWithdrawConfig).toHaveBeenCalledTimes(1);
    });

    it("accepts shared transport and realtime config", () => {
        const passthroughInterceptor: Interceptor = (next) => (req) => next(req);
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            interceptors: [passthroughInterceptor],
            wireFormat: "json",
            realtime: {
                getAuthHeaders: () => ({ authorization: "Bearer test" }),
                hasAuth: () => true,
            },
        });

        expect(client.auth).toBeInstanceOf(AccountSignerAuthService);
    });

    it("uses memory token storage by default without writing the bearer token cookie", async () => {
        const cookies = installCookieJar();
        const accountSigner = signer("0x1111111111111111111111111111111111111111");
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            accountSigner,
        });
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
        mockClientLogin(client, token);

        await client.auth.login({ provider: "turnkey" });

        expect(cookies.jar.has(POLYESTER_AUTH_TOKEN_COOKIE_NAME)).toBe(false);
        expect(client.auth.getSessionTimeToExpiry()).toBeGreaterThan(0);
    });

    it("uses a synchronized username on the next server render", async () => {
        const cookies = installCookieJar();
        const accountSigner = signer("0x1111111111111111111111111111111111111111");
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            accountSigner,
        });
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
        mockClientLogin(client, token);
        await client.auth.login({ provider: "turnkey" });

        client.auth.syncSessionUsername("alice");

        const request = new Request("https://app.polyester.exchange", {
            headers: { cookie: document.cookie },
        });
        const snapshot = parseServerSessionSnapshot(request, POLYESTER_TESTNET_ENVIRONMENT);
        expect(snapshot.username).toBe("alice");
        expect(snapshot.accountAddresses).toEqual({
            ownerAddress: accountSigner.ownerAddress,
            accountAddress: accountSigner.accountAddress,
        });
        expect(cookies.jar.has(POLYESTER_SESSION_COOKIE_NAME)).toBe(true);
    });

    it("persists bearer tokens to cookies only when cookie storage is configured", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const cookies = installCookieJar();
        const accountSigner = signer("0x1111111111111111111111111111111111111111");
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            accountSigner,
            tokenStorage: createCookieAuthTokenStorage(),
        });
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 120);
        mockClientLogin(client, token);

        await client.auth.login({ provider: "turnkey" });

        expect(cookies.jar.get(POLYESTER_AUTH_TOKEN_COOKIE_NAME)).toBe(token);
        expect(
            cookies.writes.find((write) => write.startsWith(POLYESTER_AUTH_TOKEN_COOKIE_NAME)),
        ).toContain("Max-Age=120");
    });

    it("reports unauthenticated private realtime subscriptions through onError", async () => {
        const tokenStorage = createTestStorage();
        const onError = vi.fn();
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            tokenStorage,
        });

        const unsubscribe = client.realtime.subscribe("private:orders", {
            onPublication: () => {},
            onError,
        });

        expect(unsubscribe).toBeTypeOf("function");

        await Promise.resolve();

        expect(onError.mock.calls[0]?.[0]).toMatchObject({
            channel: "private:orders",
            type: "auth",
            error: {
                message:
                    'Cannot subscribe to private channel "private:orders" without authentication',
            },
        });
        expect(tokenStorage.get).toHaveBeenCalled();
    });

    it("updates the auth account signer via setAccountSigner", () => {
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });
        const accountSigner = signer("0x3333333333333333333333333333333333333333");

        client.setAccountSigner(accountSigner);

        expect(client.auth.getAccountSigner()).toBe(accountSigner);
        expect(client.auth.getState().accountAddress).toBe(accountSigner.accountAddress);
    });

    it("rejects an account signer from another environment", () => {
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });
        const accountSigner = {
            ...signer("0x3333333333333333333333333333333333333333"),
            environmentFingerprint: "0xother",
        };

        expect(() => client.setAccountSigner(accountSigner)).toThrow(
            "Account signer environment does not match client environment.",
        );
    });

    it("wires browser auth to the client subaccounts service during construction", async () => {
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });
        const rootSigner = signer("0x1111111111111111111111111111111111111111");
        const subaccountSigner = signer("0x4444444444444444444444444444444444444444");
        const create = vi.spyOn(client.subaccounts, "create").mockResolvedValue({
            subaccountId: "subaccount-1",
            totalCreated: 1,
            smartAccountSaltNonce: 1,
            revision: "9",
        });
        mockClientLogin(client, jwtWithExp(Math.floor(Date.now() / 1000) + 3600));
        client.setAccountSigner(rootSigner);
        await client.auth.login({ provider: "turnkey" });

        await expect(
            client.auth.createSubaccount({
                accountSigner: subaccountSigner,
                label: "Trading",
                walletProvider: "turnkey",
            }),
        ).resolves.toEqual({
            subaccountId: "subaccount-1",
            smartAccountSaltNonce: 1,
            revision: "9",
        });

        expect(create).toHaveBeenCalledWith({
            label: "Trading",
            smartAccountAddress: subaccountSigner.accountAddress,
            nonce: "nonce-1",
            signature: "0xsignature",
            primaryWalletAddress: rootSigner.ownerAddress,
            walletProvider: "turnkey",
        });
    });
});
