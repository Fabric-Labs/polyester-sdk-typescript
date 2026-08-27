import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Interceptor } from "@connectrpc/connect";
import {
    createPolyesterServerClientFromCookies,
    createPolyesterServerClientFromRequest,
    parseSessionCookie,
    PolyesterServerClient,
    POLYESTER_AUTH_TOKEN_COOKIE_NAME,
    POLYESTER_SESSION_COOKIE_NAME,
    type CreateServerClientFromCookiesParams,
    type CreateServerClientFromRequestParams,
    type PolyesterServerClientConfig,
} from "./server-client.js";
import { POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";
import type { Me } from "./services/auth/auth.js";
import { MarketDataService } from "./services/market-data/index.js";
import { ZipperService } from "./services/zipper/index.js";
import { createTestCatalog } from "./testing/catalog.js";
import {
    AuthenticationError,
    ConfigurationError,
    ServiceUnavailableError,
} from "./shared/errors.js";
import type { CatalogSnapshot, CatalogSnapshotCell, ClientCatalog } from "./catalogs/index.js";

type ExpectFalse<T extends false> = T;
type ExpectTrue<T extends true> = T;

type CatalogConflict = {
    environment: typeof POLYESTER_TESTNET_ENVIRONMENT;
    catalog: ClientCatalog;
    catalogCell: CatalogSnapshotCell;
};

type CatalogHydration = {
    environment: typeof POLYESTER_TESTNET_ENVIRONMENT;
    catalogSnapshot: CatalogSnapshot;
    catalogCell: CatalogSnapshotCell;
};

type ServerConfigCatalogExclusivityTests = [
    ExpectFalse<CatalogConflict extends PolyesterServerClientConfig ? true : false>,
    ExpectFalse<
        CatalogConflict & {
            cookies: Record<string, string>;
        } extends CreateServerClientFromCookiesParams
            ? true
            : false
    >,
    ExpectFalse<
        CatalogConflict & { request: Request } extends CreateServerClientFromRequestParams
            ? true
            : false
    >,
    ExpectTrue<CatalogHydration extends PolyesterServerClientConfig ? true : false>,
    ExpectTrue<
        CatalogHydration & {
            cookies: Record<string, string>;
        } extends CreateServerClientFromCookiesParams
            ? true
            : false
    >,
    ExpectTrue<
        CatalogHydration & { request: Request } extends CreateServerClientFromRequestParams
            ? true
            : false
    >,
];

const serverConfigCatalogExclusivityTests: ServerConfigCatalogExclusivityTests = [
    false,
    false,
    false,
    true,
    true,
    true,
];
void serverConfigCatalogExclusivityTests;

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

const emptySessionShape = {
    environmentFingerprint: null,
    hasDisplaySession: false,
    provider: null,
    loginMethod: null,
    accountAddresses: null,
    activeAccount: null,
    bearerToken: null,
    username: null,
} satisfies ReturnType<typeof parseSessionCookie>;

function expectEmptySession(session: ReturnType<typeof parseSessionCookie>): void {
    expect(session).toEqual(emptySessionShape);
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

    it("preserves bearer token state without display session metadata", () => {
        const token = validJwt();
        const session = parseSessionCookie(
            {
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: token,
            },
            POLYESTER_TESTNET_ENVIRONMENT,
        );

        expect(session.hasDisplaySession).toBe(false);
        expect(session.bearerToken).toBe(token);
    });

    it("discards auth when display session metadata belongs to another environment", () => {
        const token = validJwt();
        const session = parseSessionCookie(
            {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie("0xother"),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: token,
            },
            POLYESTER_TESTNET_ENVIRONMENT,
        );

        expectEmptySession(session);
    });

    it("ignores display session metadata that fails schema validation", () => {
        const token = validJwt();
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
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: token,
            },
            POLYESTER_TESTNET_ENVIRONMENT,
        );

        expect(session).toEqual({
            ...emptySessionShape,
            bearerToken: token,
        });
    });
});

describe("PolyesterServerClient subaccount defaults", () => {
    it("rejects a non-object configuration with an SDK configuration error", () => {
        expect(() => new PolyesterServerClient(null as never)).toThrow(ConfigurationError);
        expect(() => new PolyesterServerClient(null as never)).toThrow(
            "Client configuration must be an object.",
        );
    });

    it("does not use display-session active account as a server default unless opted in", () => {
        const session = parseSessionCookie(
            {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
            },
            POLYESTER_TESTNET_ENVIRONMENT,
        );
        const client = new TestablePolyesterServerClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
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
            session,
            useDisplaySessionActiveAccountAsDefault: true,
        });

        expect(client.getDefaultSubaccountIdForTest()).toBe("sub-1");
    });
});

describe("PolyesterServerClient catalog refresh", () => {
    it("does not refresh catalogs during construction", () => {
        const refresh = mockCatalogRefreshEndpoints();

        new PolyesterServerClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
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
        });

        await client.catalog.refresh();

        expect(refresh.getSpotConfig).toHaveBeenCalledTimes(1);
        expect(refresh.getDepositWithdrawConfig).toHaveBeenCalledTimes(1);
    });

    it("server helpers do not refresh catalogs during construction", () => {
        const refresh = mockCatalogRefreshEndpoints();

        createPolyesterServerClientFromCookies({
            cookies: {},
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });
        createPolyesterServerClientFromRequest({
            request: new Request("https://example.test"),
            environment: POLYESTER_TESTNET_ENVIRONMENT,
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
        });

        expect(client.hasDisplaySession).toBe(false);
        expect(client.hasBearerToken).toBe(false);
        expect(client.hasUsableBearerToken).toBe(false);
        expect(client.hasAuthProvider).toBe(false);
    });

    it("keeps display session metadata without installing an auth provider", () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
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

    it("does not install an auth provider for a bearer token bound to another environment", () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie("0xother"),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
        });

        expect(client.hasDisplaySession).toBe(false);
        expect(client.hasBearerToken).toBe(false);
        expect(client.hasUsableBearerToken).toBe(false);
        expect(client.hasAuthProvider).toBe(false);
    });

    it("accepts framework cookie getters that return cookie objects", () => {
        const values = new Map([
            [POLYESTER_SESSION_COOKIE_NAME, displaySessionCookie()],
            [POLYESTER_AUTH_TOKEN_COOKIE_NAME, validJwt()],
        ]);
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            cookies: {
                get: (name) => {
                    const value = values.get(name);
                    return value === undefined ? undefined : { name, value };
                },
            },
        });

        expect(client.session.username).toBe("hunter");
        expect(client.hasDisplaySession).toBe(true);
        expect(client.hasBearerToken).toBe(true);
        expect(client.hasUsableBearerToken).toBe(true);
        expect(client.hasAuthProvider).toBe(true);
    });

    it("installs an auth provider for a usable bearer token without a display session", () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            cookies: {
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
        });

        expect(client.hasDisplaySession).toBe(false);
        expect(client.hasBearerToken).toBe(true);
        expect(client.hasUsableBearerToken).toBe(true);
        expect(client.hasAuthProvider).toBe(true);
    });

    it("installs an auth provider from a request without a display session", () => {
        const token = validJwt();
        const client = createPolyesterServerClientFromRequest({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            request: new Request("https://example.test", {
                headers: {
                    cookie: `${POLYESTER_AUTH_TOKEN_COOKIE_NAME}=${token}`,
                },
            }),
        });

        expect(client.hasDisplaySession).toBe(false);
        expect(client.hasBearerToken).toBe(true);
        expect(client.hasUsableBearerToken).toBe(true);
        expect(client.hasAuthProvider).toBe(true);
    });

    it("does not install an auth provider for expired or malformed bearer tokens", () => {
        const expired = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: expiredJwt(),
            },
        });
        const malformed = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
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

describe("createPolyesterServerClientFromRequest configuration", () => {
    it("rejects a missing request with an SDK configuration error", () => {
        expect(() =>
            createPolyesterServerClientFromRequest({
                environment: POLYESTER_TESTNET_ENVIRONMENT,
            } as never),
        ).toThrow(ConfigurationError);
        expect(() =>
            createPolyesterServerClientFromRequest({
                environment: POLYESTER_TESTNET_ENVIRONMENT,
            } as never),
        ).toThrow("request is required and must be a Request.");
    });
});

describe("PolyesterServerClient.verifySession", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns null when no auth provider is configured", async () => {
        const client = new PolyesterServerClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });
        const me = vi.spyOn(client.auth, "me");

        await expect(client.verifySession()).resolves.toBeNull();
        expect(me).not.toHaveBeenCalled();
    });

    it("returns the current user when the backend verifies the session", async () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
        });
        const user: Me = { accountId: "account-1", username: "hunter" };
        vi.spyOn(client.auth, "me").mockResolvedValue(user);

        await expect(client.verifySession()).resolves.toBe(user);
    });

    it("returns null when the backend rejects the session as unauthenticated", async () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
        });
        vi.spyOn(client.auth, "me").mockRejectedValue(
            new AuthenticationError("Authentication required"),
        );

        await expect(client.verifySession()).resolves.toBeNull();
    });

    it("preserves transient verification failures", async () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
        });
        const failure = new ServiceUnavailableError("Service unavailable");
        vi.spyOn(client.auth, "me").mockRejectedValue(failure);

        await expect(client.verifySession()).rejects.toBe(failure);
    });
});
