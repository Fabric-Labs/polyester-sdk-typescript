import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createPolyesterServerClient,
    createPolyesterServerClientFromCookies,
    parseSessionCookie,
    POLYESTER_AUTH_TOKEN_COOKIE_NAME,
    POLYESTER_SESSION_COOKIE_NAME,
} from "./server-client.js";
import { POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";
import type { Me } from "./services/auth/auth.js";

function jwtWithExp(exp: number): string {
    return ["header", btoa(JSON.stringify({ exp })), "signature"].join(".");
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

describe("parseSessionCookie", () => {
    it("returns empty display and bearer state when no cookies are present", () => {
        const session = parseSessionCookie({}, POLYESTER_TESTNET_ENVIRONMENT);

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
    });
});

describe("createPolyesterServerClientFromCookies", () => {
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

describe("PolyesterServerClient.verifySession", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns null when no auth provider is configured", async () => {
        const client = createPolyesterServerClient({
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

    it("returns null when backend verification fails", async () => {
        const client = createPolyesterServerClientFromCookies({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            cookies: {
                [POLYESTER_SESSION_COOKIE_NAME]: displaySessionCookie(),
                [POLYESTER_AUTH_TOKEN_COOKIE_NAME]: validJwt(),
            },
        });
        vi.spyOn(client.auth, "me").mockRejectedValue(new Error("unauthenticated"));

        await expect(client.verifySession()).resolves.toBeNull();
    });
});
