import { afterEach, describe, expect, it, vi } from "vitest";
import { createPolyesterEnvironment, POLYESTER_DEVNET_ENVIRONMENT } from "../../environment.js";
import {
    POLYESTER_AUTH_TOKEN_COOKIE_NAME,
    POLYESTER_SESSION_COOKIE_NAME,
} from "./cookie-constants.js";
import { AuthSessionStore } from "./session.js";
import {
    createAuthTokenStorageSetOptions,
    createCookieAuthTokenStorage,
    createMemoryAuthTokenStorage,
} from "./token-storage.js";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

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

function devnetEnvironment(apiUrl: string, websocketUrl: string) {
    return createPolyesterEnvironment({
        name: POLYESTER_DEVNET_ENVIRONMENT.name,
        apiUrl,
        websocketUrl,
        rpcUrl: POLYESTER_DEVNET_ENVIRONMENT.rpcUrl,
        chain: POLYESTER_DEVNET_ENVIRONMENT.chain,
        accountAbstraction: POLYESTER_DEVNET_ENVIRONMENT.accountAbstraction,
        contracts: POLYESTER_DEVNET_ENVIRONMENT.contracts,
    });
}

function sessionCookie(fingerprint: string): string {
    return encodeURIComponent(
        JSON.stringify({
            environmentFingerprint: fingerprint,
            provider: "metamask",
            loginMethod: "metamask",
            primaryWallet: "0xprimary",
            smartAccount: "0xsmart",
            activeAccount: {
                accountId: "main-1",
                isMain: true,
                mainAccountId: "main-1",
            },
        }),
    );
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (originalDocument) {
        Object.defineProperty(globalThis, "document", originalDocument);
    } else {
        Reflect.deleteProperty(globalThis, "document");
    }
});

describe("auth token storage", () => {
    it("stores memory tokens per storage instance", () => {
        const first = createMemoryAuthTokenStorage("token-1");
        const second = createMemoryAuthTokenStorage();

        expect(first.get()).toBe("token-1");
        expect(second.get()).toBeNull();

        second.set("token-2", { expiresAt: null, maxAgeSeconds: null });
        first.clear();

        expect(first.get()).toBeNull();
        expect(second.get()).toBe("token-2");
    });

    it("sets cookie token Max-Age from the JWT exp claim", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const cookies = installCookieJar();
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 180);
        const storage = createCookieAuthTokenStorage();

        storage.set(token, createAuthTokenStorageSetOptions(token));

        expect(storage.get()).toBe(token);
        expect(cookies.jar.get(POLYESTER_AUTH_TOKEN_COOKIE_NAME)).toBe(token);
        expect(cookies.writes[0]).toContain("Max-Age=180");
        expect(cookies.writes[0]).toContain("Expires=Thu, 01 Jan 2026 00:03:00 GMT");
    });

    it("does not add persistent cookie attributes when JWT expiry is unavailable", () => {
        const cookies = installCookieJar();
        const storage = createCookieAuthTokenStorage();

        storage.set("not-a-jwt", createAuthTokenStorageSetOptions("not-a-jwt"));

        expect(cookies.writes[0]).not.toContain("Max-Age=");
        expect(cookies.writes[0]).not.toContain("Expires=");
    });

    it("uses an integer Max-Age for fractional JWT expiration timestamps", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.250Z"));
        const token = jwtWithExp(Date.now() / 1000 + 180.5);
        const cookies = installCookieJar();
        const storage = createCookieAuthTokenStorage();

        expect(() => storage.set(token, createAuthTokenStorageSetOptions(token))).not.toThrow();
        expect(cookies.writes[0]).toContain("Max-Age=180");
    });

    it("keeps the auth token when only the API and WebSocket gateways change", () => {
        const cookies = installCookieJar();
        const global = devnetEnvironment(
            "https://api.devnet.polyester.com",
            "wss://api.devnet.polyester.com",
        );
        const regional = devnetEnvironment(
            "https://iad.api.devnet.polyester.com",
            "wss://iad.api.devnet.polyester.com",
        );
        const storage = createCookieAuthTokenStorage();

        storage.set("token-1", createAuthTokenStorageSetOptions("token-1"));
        cookies.jar.set(POLYESTER_SESSION_COOKIE_NAME, sessionCookie(global.fingerprint));

        expect(
            new AuthSessionStore({
                environmentFingerprint: regional.fingerprint,
            }).getEnvironmentBoundToken(storage),
        ).toBe("token-1");
        expect(cookies.jar.get(POLYESTER_AUTH_TOKEN_COOKIE_NAME)).toBe("token-1");
        expect(cookies.jar.get(POLYESTER_SESSION_COOKIE_NAME)).toBe(
            sessionCookie(regional.fingerprint),
        );
    });

    it("clears both cookies for an old URL-inclusive fingerprint", () => {
        const cookies = installCookieJar();
        const storage = createCookieAuthTokenStorage();
        const legacyDevnetFingerprint =
            "0xcf37f208361309f72495de61387ea46d6a339bf35d848138caf9b51d7b8fb38d";

        storage.set("token-1", createAuthTokenStorageSetOptions("token-1"));
        cookies.jar.set(POLYESTER_SESSION_COOKIE_NAME, sessionCookie(legacyDevnetFingerprint));

        expect(
            new AuthSessionStore({
                environmentFingerprint: POLYESTER_DEVNET_ENVIRONMENT.fingerprint,
            }).getEnvironmentBoundToken(storage),
        ).toBeNull();
        expect(cookies.jar.has(POLYESTER_AUTH_TOKEN_COOKIE_NAME)).toBe(false);
        expect(cookies.jar.has(POLYESTER_SESSION_COOKIE_NAME)).toBe(false);
    });

    it("clears both cookies when the display session has a foreign fingerprint", () => {
        const cookies = installCookieJar();
        const storage = createCookieAuthTokenStorage();

        storage.set("token-1", createAuthTokenStorageSetOptions("token-1"));
        cookies.jar.set(POLYESTER_SESSION_COOKIE_NAME, sessionCookie("0xforeign"));

        expect(
            new AuthSessionStore({
                environmentFingerprint: POLYESTER_DEVNET_ENVIRONMENT.fingerprint,
            }).getEnvironmentBoundToken(storage),
        ).toBeNull();
        expect(cookies.jar.has(POLYESTER_AUTH_TOKEN_COOKIE_NAME)).toBe(false);
        expect(cookies.jar.has(POLYESTER_SESSION_COOKIE_NAME)).toBe(false);
    });
});
