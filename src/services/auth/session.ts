import {
    setCookie,
    deleteCookie,
    getCookie,
    getCookieValue,
    type CookieGetter,
} from "../../utils/cookies.js";
import { isDev } from "../../utils/is-dev.js";
import {
    POLYESTER_AUTH_TOKEN_COOKIE_NAME,
    POLYESTER_SESSION_COOKIE_NAME,
    POLYESTER_LOGIN_COOKIE_MAX_AGE,
} from "./cookie-constants.js";
import { SessionCodec } from "./session-codec.js";
import type { PolyesterEnvironment } from "../../environment.js";
import type { AuthTokenStorage, AuthTokenStorageSetOptions } from "./token-storage.js";
import type {
    ActiveAccountInfo,
    AuthLoginMethod,
    ServerSessionSnapshot,
    SessionData,
} from "./session.types.js";

export type { ActiveAccountInfo, AuthLoginMethod, ServerSessionSnapshot, SessionData };

export interface SessionCookieOptions {
    maxAgeSeconds?: number | null;
}

export interface CommitLoginSessionParams {
    accessToken: string;
    tokenOptions: AuthTokenStorageSetOptions;
    provider: SessionData["provider"];
    loginMethod: AuthLoginMethod | null;
    primaryWallet: string;
    smartAccount: string;
    accountId: string;
    username?: string;
}

export interface EnsureSessionParams {
    provider: SessionData["provider"];
    loginMethod: AuthLoginMethod | null;
    primaryWallet: string;
    smartAccount: string;
    accountId: string;
    username?: string;
}

function resolveSessionCookieMaxAge(options?: SessionCookieOptions): number | undefined {
    if (!options) return POLYESTER_LOGIN_COOKIE_MAX_AGE;
    return options.maxAgeSeconds ?? undefined;
}

/**
 * Reads and writes the browser display-session cookie.
 */
class PolyesterSessionManager {
    /**
     * Replaces the current session state.
     */
    set(session: SessionData, options?: SessionCookieOptions): void {
        setCookie({
            name: POLYESTER_SESSION_COOKIE_NAME,
            value: SessionCodec.encode(session),
            options: {
                path: "/",
                maxAge: resolveSessionCookieMaxAge(options),
                secure: !isDev(),
                sameSite: "lax",
            },
        });
    }

    /**
     * Returns the current session state, or null when no session is active.
     */
    get(): SessionData | null {
        const value = getCookie(POLYESTER_SESSION_COOKIE_NAME);
        if (!value) return null;

        const session = SessionCodec.decode(value);
        if (!session) {
            this.clear();
            return null;
        }

        return session;
    }

    /**
     * Clears the current session state.
     */
    clear(): void {
        deleteCookie(POLYESTER_SESSION_COOKIE_NAME);
    }
}

export const polyesterSession = new PolyesterSessionManager();

export function emptyServerSessionSnapshot(): ServerSessionSnapshot {
    return {
        environmentFingerprint: null,
        hasDisplaySession: false,
        provider: null,
        loginMethod: null,
        accountAddresses: null,
        activeAccount: null,
        bearerToken: null,
        username: null,
    };
}

/**
 * Parses a serialized session cookie into a display-only server snapshot.
 */
export function parseServerSessionSnapshot(
    cookies: CookieGetter,
    environment: PolyesterEnvironment,
): ServerSessionSnapshot {
    const sessionValue = getCookieValue(cookies, POLYESTER_SESSION_COOKIE_NAME);
    const bearerToken = getCookieValue(cookies, POLYESTER_AUTH_TOKEN_COOKIE_NAME) ?? null;
    const session = sessionValue ? SessionCodec.decode(sessionValue) : null;

    if (!session || session.environmentFingerprint !== environment.fingerprint) {
        return emptyServerSessionSnapshot();
    }

    return {
        environmentFingerprint: session.environmentFingerprint,
        hasDisplaySession: true,
        provider: session.provider,
        loginMethod: session.loginMethod,
        accountAddresses: {
            ownerAddress: session.primaryWallet,
            accountAddress: session.smartAccount,
        },
        activeAccount: session.activeAccount ?? null,
        bearerToken,
        username: session.username ?? null,
    };
}

/**
 * Owns environment-bound auth session transitions for browser clients.
 */
export class AuthSessionStore {
    #environmentFingerprint: string;
    #session: PolyesterSessionManager;

    constructor({ environmentFingerprint }: { environmentFingerprint: string }) {
        this.#environmentFingerprint = environmentFingerprint;
        this.#session = polyesterSession;
    }

    get(): SessionData | null {
        const session = this.#session.get();
        if (!session) return null;
        if (session.environmentFingerprint !== this.#environmentFingerprint) {
            this.#session.clear();
            return null;
        }
        return session;
    }

    getEnvironmentBoundToken(tokenStorage: AuthTokenStorage): string | null {
        const token = tokenStorage.get();
        if (!token) return null;

        if (!this.get()) {
            tokenStorage.clear();
            return null;
        }

        return token;
    }

    commitLogin(params: CommitLoginSessionParams, tokenStorage: AuthTokenStorage): void {
        tokenStorage.set(params.accessToken, params.tokenOptions);
        this.#session.set(
            {
                environmentFingerprint: this.#environmentFingerprint,
                provider: params.provider,
                loginMethod: params.loginMethod,
                primaryWallet: params.primaryWallet,
                smartAccount: params.smartAccount,
                activeAccount: {
                    accountId: params.accountId,
                    isMain: true,
                    mainAccountId: params.accountId,
                },
                username: params.username,
            },
            { maxAgeSeconds: params.tokenOptions.maxAgeSeconds },
        );
    }

    ensureSession(params: EnsureSessionParams, options?: SessionCookieOptions): SessionData {
        const existingSession = this.get();
        if (existingSession) return existingSession;

        const session: SessionData = {
            environmentFingerprint: this.#environmentFingerprint,
            provider: params.provider,
            loginMethod: params.loginMethod,
            primaryWallet: params.primaryWallet,
            smartAccount: params.smartAccount,
            activeAccount: {
                accountId: params.accountId,
                isMain: true,
                mainAccountId: params.accountId,
            },
            username: params.username,
        };
        this.#session.set(session, options);
        return session;
    }

    setActiveAccount(
        activeAccount: Omit<ActiveAccountInfo, "mainAccountId">,
        options?: SessionCookieOptions,
    ): void {
        const session = this.get();
        if (!session) return;

        const mainAccountId = session.activeAccount?.mainAccountId ?? activeAccount.accountId;
        const smartAccountAddress = activeAccount.isMain
            ? session.smartAccount
            : activeAccount.smartAccountAddress;
        const label = activeAccount.isMain ? undefined : activeAccount.label;
        this.#session.set(
            {
                ...session,
                activeAccount: { ...activeAccount, mainAccountId, smartAccountAddress, label },
                username: session.username,
            },
            options,
        );
    }

    clear(): void {
        this.#session.clear();
    }
}
