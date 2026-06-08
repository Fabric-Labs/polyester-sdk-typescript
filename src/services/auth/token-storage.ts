import { CookieManager } from "../../utils/cookies.js";
import { getJwtExpiration } from "../../utils/jwt.js";
import { POLYESTER_AUTH_TOKEN_COOKIE_NAME } from "./cookie-constants.js";
import { polyesterSession } from "./session.js";

export interface AuthTokenStorageSetOptions {
    expiresAt: Date | null;
    maxAgeSeconds: number | null;
}

export interface AuthTokenStorage {
    get(): string | null;
    set(token: string, options: AuthTokenStorageSetOptions): void;
    clear(): void;
}

export interface CookieAuthTokenStorageOptions {
    cookieName?: string;
    path?: string;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
}

/**
 * Builds cookie write options for auth token storage.
 */
export function createAuthTokenStorageSetOptions(token: string): AuthTokenStorageSetOptions {
    const exp = getJwtExpiration(token);
    if (exp === null) {
        return { expiresAt: null, maxAgeSeconds: null };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
        expiresAt: new Date(exp * 1000),
        maxAgeSeconds: Math.max(0, exp - nowSeconds),
    };
}

/**
 * Creates in-memory auth token storage.
 */
export function createMemoryAuthTokenStorage(initialToken?: string | null): AuthTokenStorage {
    let storedToken = initialToken ?? null;

    return {
        get: () => storedToken,
        set: (token: string) => {
            storedToken = token;
        },
        clear: () => {
            storedToken = null;
        },
    };
}

/**
 * Creates cookie-backed auth token storage.
 */
export function createCookieAuthTokenStorage(
    options: CookieAuthTokenStorageOptions = {},
): AuthTokenStorage {
    const cookieName = options.cookieName ?? POLYESTER_AUTH_TOKEN_COOKIE_NAME;
    const path = options.path ?? "/";
    const cookie = new CookieManager({ name: cookieName });

    return {
        get: () => cookie.get(),
        set: (token: string, setOptions: AuthTokenStorageSetOptions) => {
            cookie.set(token, {
                path,
                secure: options.secure,
                sameSite: options.sameSite,
                maxAge: setOptions.maxAgeSeconds ?? undefined,
                expires: setOptions.expiresAt ?? undefined,
            });
        },
        clear: () => {
            cookie.clear({ path });
        },
    };
}

/**
 * Returns the auth token scoped to the active SDK environment.
 */
export function getEnvironmentBoundAuthToken(
    tokenStorage: AuthTokenStorage,
    environmentFingerprint: string,
): string | null {
    const token = tokenStorage.get();
    if (!token) return null;

    const session = polyesterSession.get();
    if (session?.environmentFingerprint !== environmentFingerprint) {
        tokenStorage.clear();
        if (session) polyesterSession.clear();
        return null;
    }

    return token;
}
