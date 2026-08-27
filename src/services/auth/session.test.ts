import { afterEach, describe, expect, it, vi } from "vitest";
import { POLYESTER_TESTNET_ENVIRONMENT } from "../../environment.js";
import { POLYESTER_SESSION_COOKIE_NAME } from "./cookie-constants.js";
import { AuthSessionStore, polyesterSession } from "./session.js";
import type { SessionData } from "./session.types.js";
import type { AuthTokenStorage } from "./token-storage.js";

function sessionCookie(session: unknown): string {
    return `${POLYESTER_SESSION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(session))}`;
}

function validSession(): SessionData {
    return {
        environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
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
    };
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

describe("polyesterSession", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns schema-valid display session data from cookies", () => {
        const session = validSession();
        vi.stubGlobal("document", { cookie: sessionCookie(session) });

        expect(polyesterSession.get()).toEqual(session);
    });

    it("accepts Rabby as a wallet login method", () => {
        const session = { ...validSession(), provider: "other", loginMethod: "rabby" } as const;
        vi.stubGlobal("document", { cookie: sessionCookie(session) });

        expect(polyesterSession.get()).toEqual(session);
    });

    it("clears and ignores display session data that fails schema validation", () => {
        const session = {
            ...validSession(),
            activeAccount: {
                accountId: "sub-1",
                isMain: "false",
                mainAccountId: "main-1",
            },
        };
        vi.stubGlobal("document", { cookie: sessionCookie(session) });

        expect(polyesterSession.get()).toBeNull();
        expect(polyesterSession.get()).toBeNull();
    });
});

describe("AuthSessionStore", () => {
    afterEach(() => {
        polyesterSession.clear();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("returns environment-bound tokens when the display session matches", () => {
        const storage = createTestStorage("token-1");
        const store = new AuthSessionStore({
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        });
        vi.stubGlobal("document", { cookie: sessionCookie(validSession()) });

        expect(store.getEnvironmentBoundToken(storage)).toBe("token-1");
        expect(storage.clear).not.toHaveBeenCalled();
    });

    it("keeps bearer tokens when the display session cookie is missing", () => {
        const storage = createTestStorage("token-1");
        const store = new AuthSessionStore({
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        });
        vi.stubGlobal("document", { cookie: "" });

        expect(store.getEnvironmentBoundToken(storage)).toBe("token-1");
        expect(storage.clear).not.toHaveBeenCalled();
        expect(storage.get()).toBe("token-1");
    });

    it("clears configured token storage when the display session belongs to another environment", () => {
        const storage = createTestStorage("token-1");
        const store = new AuthSessionStore({
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        });
        vi.stubGlobal("document", {
            cookie: sessionCookie({ ...validSession(), environmentFingerprint: "0xother" }),
        });

        expect(store.getEnvironmentBoundToken(storage)).toBeNull();
        expect(storage.clear).toHaveBeenCalledTimes(1);
        expect(polyesterSession.get()).toBeNull();
    });

    it("updates only the username in an existing display session", () => {
        const session = validSession();
        vi.stubGlobal("document", { cookie: sessionCookie(session) });
        const store = new AuthSessionStore({
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        });

        store.setUsername("alice");

        expect(store.get()).toEqual({ ...session, username: "alice" });
    });

    it("clears the username without creating or replacing the rest of the session", () => {
        const session = validSession();
        vi.stubGlobal("document", { cookie: sessionCookie(session) });
        const store = new AuthSessionStore({
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        });

        store.setUsername(null);

        expect(store.get()).toEqual({ ...session, username: undefined });
    });

    it("persists the active subaccount identity for the next server render", () => {
        const session = validSession();
        vi.stubGlobal("document", { cookie: sessionCookie(session) });
        const store = new AuthSessionStore({
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        });

        store.setActiveAccount({
            accountId: "sub-2",
            isMain: false,
            label: "Operations",
            smartAccountAddress: "0xsub2",
        });

        expect(store.get()?.activeAccount).toEqual({
            accountId: "sub-2",
            isMain: false,
            mainAccountId: "main-1",
            label: "Operations",
            smartAccountAddress: "0xsub2",
        });
    });

    it("repairs a stale username when ensuring an existing session", () => {
        const session = validSession();
        vi.stubGlobal("document", { cookie: sessionCookie(session) });
        const store = new AuthSessionStore({
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        });

        const ensured = store.ensureSession({
            provider: session.provider,
            loginMethod: session.loginMethod,
            primaryWallet: session.primaryWallet,
            smartAccount: session.smartAccount,
            accountId: session.activeAccount?.mainAccountId ?? "main-1",
            username: "alice",
        });

        expect(ensured).toEqual({ ...session, username: "alice" });
        expect(store.get()).toEqual(ensured);
    });
});
