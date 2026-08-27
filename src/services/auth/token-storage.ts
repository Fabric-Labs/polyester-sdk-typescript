import { CookieManager } from "../../utils/cookies.js";
import { getJwtExpiration } from "../../utils/jwt.js";
import { POLYESTER_AUTH_TOKEN_COOKIE_NAME } from "./cookie-constants.js";

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

    const nowSeconds = Date.now() / 1000;
    return {
        expiresAt: new Date(exp * 1000),
        maxAgeSeconds: Math.max(0, Math.floor(exp - nowSeconds)),
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
