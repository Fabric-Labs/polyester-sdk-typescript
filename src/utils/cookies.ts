import { isDev } from "./is-dev.js";
import { parseCookie, serializeCookie } from "./cookie-es/index.js";

interface CookieOptions {
    path?: string;
    domain?: string;
    expires?: Date | string;
    maxAge?: number;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none";
}

function normalizeCookieOptions(options: CookieOptions) {
    return {
        ...options,
        expires:
            options.expires === undefined
                ? undefined
                : options.expires instanceof Date
                  ? options.expires
                  : new Date(options.expires),
    };
}

function toCookieRecord(cookies: Record<string, string | undefined>): Record<string, string> {
    const record: Record<string, string> = {};
    for (const [name, value] of Object.entries(cookies)) {
        if (value !== undefined) {
            record[name] = value;
        }
    }
    return record;
}

interface SetCookieParams {
    name: string;
    value: string;
    options: CookieOptions;
}

/**
 * Writes a browser cookie.
 */
export function setCookie({ name, value, options }: SetCookieParams): void {
    if (typeof document === "undefined") return;

    document.cookie = serializeCookie(name, value, normalizeCookieOptions(options));
}

/**
 * Reads a browser cookie by name.
 */
export function getCookie(name: string): string | undefined {
    if (typeof document === "undefined") return;

    return parseCookie(document.cookie)[name];
}

/**
 * Deletes a browser cookie by name.
 */
export function deleteCookie(name: string, options?: { path?: string }): void {
    if (typeof document === "undefined") return;

    document.cookie = serializeCookie(name, "", {
        path: options?.path ?? "/",
        expires: new Date("Thu, 01 Jan 1970 00:00:00 GMT"),
    });
}

export type CookieGetter =
    | Record<string, string>
    | { get(name: string): string | undefined }
    | Request;

/**
 * Parses cookies from a Request header.
 */
export function parseCookiesFromRequest(request: Request): Record<string, string> {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return {};

    return toCookieRecord(parseCookie(cookieHeader));
}

/**
 * Reads a cookie value from either a cookie map or cookie getter.
 */
export function getCookieValue(cookies: CookieGetter, name: string): string | undefined {
    if (cookies instanceof Request) {
        const parsed = parseCookiesFromRequest(cookies);
        return parsed[name];
    }
    if (typeof cookies.get === "function") {
        return cookies.get(name);
    }
    return (cookies as Record<string, string>)[name];
}

interface CookieManagerOptions {
    /**
     * The name of the cookie to manage.
     */
    name: string;
}

/**
 * A generic class for managing cookies on the client side.
 * Provides a consistent interface for getting, setting, and deleting cookies.
 *
 * @example
 * ```ts
 * const cookieManager = new CookieManager({ name: "my-cookie" });
 * cookieManager.get();
 * cookieManager.set("my-value");
 * cookieManager.clear();
 * ```
 */
export class CookieManager {
    #name: string;
    constructor(opts: CookieManagerOptions) {
        this.#name = opts.name;
    }
    /**
     * Reads the managed cookie value.
     */
    get(): string | null {
        const token = getCookie(this.#name);
        return token ?? null;
    }

    /**
     * Writes the managed cookie value.
     */
    set(
        token: string,
        options?: {
            path?: string;
            secure?: boolean;
            sameSite?: "lax" | "strict" | "none";
            maxAge?: number;
            expires?: Date;
        },
    ): void {
        setCookie({
            name: this.#name,
            value: token,
            options: {
                path: options?.path ?? "/",
                sameSite: options?.sameSite ?? "lax",
                secure: options?.secure ?? (isDev() ? false : true),
                maxAge: options?.maxAge,
                expires: options?.expires,
            },
        });
    }

    /**
     * Clears the managed cookie value.
     */
    clear(options?: { path?: string }): void {
        deleteCookie(this.#name, options);
    }
}
