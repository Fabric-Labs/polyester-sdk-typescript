import { afterEach, describe, expect, it, vi } from "vitest";
import { POLYESTER_TESTNET_ENVIRONMENT } from "../../environment.js";
import { POLYESTER_AUTH_TOKEN_COOKIE_NAME } from "./cookie-constants.js";
import { polyesterSession } from "./session.js";
import {
    createAuthTokenStorageSetOptions,
    createCookieAuthTokenStorage,
    createMemoryAuthTokenStorage,
    getEnvironmentBoundAuthToken,
    type AuthTokenStorage,
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

function createTestStorage(initialToken: string | null) {
    let token = initialToken;
    return {
        get: () => token,
        set: (nextToken: string) => {
            token = nextToken;
        },
        clear: vi.fn(() => {
            token = null;
        }),
    } satisfies AuthTokenStorage;
}

afterEach(() => {
    polyesterSession.clear();
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

    it("clears configured storage when the display session belongs to another environment", () => {
        installCookieJar();
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 180);
        const storage = createTestStorage(token);
        polyesterSession.set({
            environmentFingerprint: "other-environment",
            provider: "turnkey",
            loginMethod: null,
            primaryWallet: "0xprimary",
            smartAccount: "0xsmart",
        });

        expect(
            getEnvironmentBoundAuthToken(storage, POLYESTER_TESTNET_ENVIRONMENT.fingerprint),
        ).toBeNull();
        expect(storage.clear).toHaveBeenCalledTimes(1);
    });
});
