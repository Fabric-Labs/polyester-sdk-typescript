import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Interceptor } from "@connectrpc/connect";
import {
    createPolyesterServerClientFromCookies,
    createPolyesterServerClientFromRequest,
    parseSessionCookie,
    PolyesterServerClient,
    POLYESTER_AUTH_TOKEN_COOKIE_NAME,
    POLYESTER_SESSION_COOKIE_NAME,
} from "./server-client.js";
import { POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";
import type { Me } from "./services/auth/auth.js";
import { MarketDataService } from "./services/market-data/index.js";
import { ZipperService } from "./services/zipper/index.js";
import { createTestCatalog } from "./testing/catalog.js";

function base64UrlEncode(value: string): string {
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function jwtWithExp(exp: number): string {
    return ["header", base64UrlEncode(JSON.stringify({ exp })), "signature"].join(".");
}

function validJwt(): string {
    return jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
}

function expiredJwt(): string {
    return jwtWithExp(Math.floor(Date.now() / 1000) - 3600);
}

function displaySessionCookie(
    environmentFingerprint = POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
): string {
    return JSON.stringify({
        environmentFingerprint,
        provider: "metamask",
        loginMethod: "metamask",
        primaryWallet: "0xprimary",
        smartAccount: "0xsmart",
        activeAccount: {
            accountId: "sub-1",
            isMain: false,
            mainAccountId: "main-1",
        },
        username: "hunter",
    });
}

function encodedDisplaySessionCookie(): string {
    return encodeURIComponent(displaySessionCookie());
}

function legacyDoubleEncodedDisplaySessionCookie(): string {
    return encodeURIComponent(encodedDisplaySessionCookie());
}

function expectDisplaySession(session: ReturnType<typeof parseSessionCookie>): void {
    expect(session.hasDisplaySession).toBe(true);
    expect(session.bearerToken).toBeNull();
    expect(session.environmentFingerprint).toBe(POLYESTER_TESTNET_ENVIRONMENT.fingerprint);
    expect(session.provider).toBe("metamask");
    expect(session.loginMethod).toBe("metamask");
    expect(session.accountAddresses).toEqual({
        ownerAddress: "0xprimary",
        accountAddress: "0xsmart",
    });
    expect(session.activeAccount).toEqual({
        accountId: "sub-1",
        isMain: false,
        mainAccountId: "main-1",
    });
    expect(session.username).toBe("hunter");
}

function expectEmptySession(session: ReturnType<typeof parseSessionCookie>): void {
    expect(session).toEqual({
        environmentFingerprint: null,
        hasDisplaySession: false,
        provider: null,
        loginMethod: null,
        accountAddresses: null,
        activeAccount: null,
        bearerToken: null,
        username: null,
    });
}

class TestablePolyesterServerClient extends PolyesterServerClient {
    getDefaultSubaccountIdForTest(): string | null {
        return this.createSubaccountResolver().getDefaultSubaccountId();
    }
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

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.restoreAllMocks();
});

describe("parseSessionCookie", () => {
    it("returns empty display and bearer state when no cookies are present", () => {
        const session = parseSessionCookie({}, POLYESTER_TESTNET_ENVIRONMENT);

        expectEmptySession(session);
    });

    it("parses unsigned display session metadata without implying auth", () => {
        const session = parseSessionCookie(
            {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
            },
            POLYESTER_TESTNET_ENVIRONMENT,
        );

        expectDisplaySession(session);
    });

    it("parses encoded display session metadata from raw request cookies", () => {
        const request = new Request("https://example.test", {
            headers: {
                cookie: `${POLYESTER_SESSION_COOKIE_NAME}=${encodedDisplaySessionCookie()}`,
            },
        });

        const session = parseSessionCookie(request, POLYESTER_TESTNET_ENVIRONMENT);

        expectDisplaySession(session);
    });

    it("parses legacy double-encoded display session metadata", () => {
        const request = new Request("https://example.test", {
            headers: {
                cookie: `${POLYESTER_SESSION_COOKIE_NAME}=${legacyDoubleEncodedDisplaySessionCookie()}`,
            },
        });

        const session = parseSessionCookie(request, POLYESTER_TESTNET_ENVIRONMENT);

        expectDisplaySession(session);
    });

    it("ignores bearer token state without matching display session metadata", () => {
        const token = validJwt();
        const session = parseSessionCookie(
            {
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: token,
            },
            POLYESTER_TESTNET_ENVIRONMENT,
        );

        expect(session.hasDisplaySession).toBe(false);
        expect(session.bearerToken).toBeNull();
    });

    it("ignores display session metadata for another environment", () => {
        const session = parseSessionCookie(
            {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie("0xother"),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
            POLYESTER_TESTNET_ENVIRONMENT,
        );

        expectEmptySession(session);
    });

    it("ignores display session metadata that fails schema validation", () => {
        const invalidSession = {
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
            provider: "metamask",
            loginMethod: "metamask",
            primaryWallet: "0xprimary",
            smartAccount: "0xsmart",
            activeAccount: {
                accountId: "sub-1",
                isMain: "false",
                mainAccountId: "main-1",
            },
            username: "hunter",
        };

        const session = parseSessionCookie(
            {
                [POLYESTER_SESSION_COOKIE_NAME]: JSON.stringify(invalidSession),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
            POLYESTER_TESTNET_ENVIRONMENT,
        );

        expectEmptySession(session);
    });
});

describe("PolyesterServerClient subaccount defaults", () => {
    it("does not use display-session active account as a server default unless opted in", () => {
        const session = parseSessionCookie(
            {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
            },
            POLYESTER_TESTNET_ENVIRONMENT,
        );
        const client = new TestablePolyesterServerClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
            session,
        });

        expect(client.getDefaultSubaccountIdForTest()).toBeNull();
    });

    it("uses display-session active account as a server default when explicitly opted in", () => {
        const session = parseSessionCookie(
            {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
            },
            POLYESTER_TESTNET_ENVIRONMENT,
        );
        const client = new TestablePolyesterServerClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
            session,
            useDisplaySessionActiveAccountAsDefault: true,
        });

        expect(client.getDefaultSubaccountIdForTest()).toBe("sub-1");
    });
});

describe("PolyesterServerClient catalog refresh", () => {
    it("refreshes catalogs in the background by default", () => {
        const refresh = mockCatalogRefreshEndpoints();

        new PolyesterServerClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });

        expect(refresh.getSpotConfig).toHaveBeenCalledTimes(1);
        expect(refresh.getDepositWithdrawConfig).toHaveBeenCalledTimes(1);
    });

    it("skips background catalog refresh when disabled", () => {
        const refresh = mockCatalogRefreshEndpoints();

        new PolyesterServerClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });

        expect(refresh.getSpotConfig).not.toHaveBeenCalled();
        expect(refresh.getDepositWithdrawConfig).not.toHaveBeenCalled();
    });

    it("uses an injected catalog without starting runtime refresh", () => {
        const refresh = mockCatalogRefreshEndpoints();
        const catalog = createTestCatalog();

        const client = new PolyesterServerClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            catalog,
        });

        expect(client.catalog).toBe(catalog);
        expect(refresh.getSpotConfig).not.toHaveBeenCalled();
        expect(refresh.getDepositWithdrawConfig).not.toHaveBeenCalled();
    });

    it("refreshes catalogs explicitly", async () => {
        const refresh = mockCatalogRefreshEndpoints();
        const client = new PolyesterServerClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });

        await client.catalog.refresh();

        expect(refresh.getSpotConfig).toHaveBeenCalledTimes(1);
        expect(refresh.getDepositWithdrawConfig).toHaveBeenCalledTimes(1);
    });

    it("passes the refresh opt-out through server helpers", () => {
        const refresh = mockCatalogRefreshEndpoints();

        createPolyesterServerClientFromCookies({
            cookies: {},
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });
        createPolyesterServerClientFromRequest({
            request: new Request("https://example.test"),
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });

        expect(refresh.getSpotConfig).not.toHaveBeenCalled();
        expect(refresh.getDepositWithdrawConfig).not.toHaveBeenCalled();
    });
});

describe("createPolyesterServerClientFromCookies", () => {
    it("accepts shared transport and realtime config", () => {
        const passthroughInterceptor: Interceptor = (next) => (req) => next(req);
        const client = createPolyesterServerClientFromCookies({
            cookies: {},
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            interceptors: [passthroughInterceptor],
            wireFormat: "json",
            refreshCatalogs: false,
            realtime: {
                getAuthHeaders: () => ({ authorization: "Bearer test" }),
                hasAuth: () => true,
            },
        });

        expect(client).toBeInstanceOf(PolyesterServerClient);
    });

    it("does not install an auth provider without cookies", () => {
        const client = createPolyesterServerClientFromCookies({
            cookies: {},
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });

        expect(client.hasDisplaySession).toBe(false);
        expect(client.hasBearerToken).toBe(false);
        expect(client.hasUsableBearerToken).toBe(false);
        expect(client.hasAuthProvider).toBe(false);
    });

    it("keeps display session metadata without installing an auth provider", () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
            },
        });

        expect(client.hasDisplaySession).toBe(true);
        expect(client.hasBearerToken).toBe(false);
        expect(client.hasUsableBearerToken).toBe(false);
        expect(client.hasAuthProvider).toBe(false);
    });

    it("installs an auth provider for a usable bearer token", () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
        });

        expect(client.hasDisplaySession).toBe(true);
        expect(client.hasBearerToken).toBe(true);
        expect(client.hasUsableBearerToken).toBe(true);
        expect(client.hasAuthProvider).toBe(true);
    });

    it("does not install an auth provider for expired or malformed bearer tokens", () => {
        const expired = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: expiredJwt(),
            },
        });
        const malformed = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: "not-a-jwt",
            },
        });

        expect(expired.hasBearerToken).toBe(true);
        expect(expired.hasUsableBearerToken).toBe(false);
        expect(expired.hasAuthProvider).toBe(false);
        expect(malformed.hasBearerToken).toBe(true);
        expect(malformed.hasUsableBearerToken).toBe(false);
        expect(malformed.hasAuthProvider).toBe(false);
    });
});

describe("PolyesterServerClient.verifySession", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns null when no auth provider is configured", async () => {
        const client = new PolyesterServerClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });
        const me = vi.spyOn(client.auth, "me");

        await expect(client.verifySession()).resolves.toBeNull();
        expect(me).not.toHaveBeenCalled();
    });

    it("returns the current user when the backend verifies the session", async () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
        });
        const user: Me = { accountId: "account-1", username: "hunter" };
        vi.spyOn(client.auth, "me").mockResolvedValue(user);

        await expect(client.verifySession()).resolves.toBe(user);
    });

    it("returns null when backend verification fails", async () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
        });
        vi.spyOn(client.auth, "me").mockRejectedValue(new Error("unauthenticated"));

        await expect(client.verifySession()).resolves.toBeNull();
    });
});
