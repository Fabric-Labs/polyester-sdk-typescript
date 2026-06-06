import { isDev } from "./is-dev.js";

function serializeCookie(name: string, value: string, options: CookieOptions) {
    const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

    if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
    if (options.domain) parts.push(`Domain=${options.domain}`);
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.expires) {
        const expires =
            options.expires instanceof Date ? options.expires : new Date(options.expires);
        parts.push(`Expires=${expires.toUTCString()}`);
    }
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    if (options.secure) parts.push("Secure");
    if (options.httpOnly) parts.push("HttpOnly");

    return parts.join("; ");
}

interface CookieOptions {
    path?: string;
    domain?: string;
    expires?: Date | string;
    maxAge?: number;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none";
}

interface SetCookieParams {
    name: string;
    value: string;
    options: CookieOptions;
}

export function setCookie({ name, value, options }: SetCookieParams): void {
    if (typeof document === "undefined") return;

    document.cookie = serializeCookie(name, value, options);
}

export function getCookie(name: string): string | undefined {
    if (typeof document === "undefined") return;

    return document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${name}=`))
        ?.split("=")[1];
}

export function deleteCookie(name: string): void {
    if (typeof document === "undefined") return;

    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export type CookieGetter =
    | Record<string, string>
    | { get(name: string): string | undefined }
    | Request;

export function parseCookiesFromRequest(request: Request): Record<string, string> {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return {};

    const cookies: Record<string, string> = {};
    for (const cookie of cookieHeader.split(";")) {
        const [name, ...valueParts] = cookie.trim().split("=");
        if (name) {
            cookies[name] = valueParts.join("=");
        }
    }
    return cookies;
}

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
    get(): string | null {
        const token = getCookie(this.#name);
        return token ?? null;
    }

    set(
        token: string,
        options?: {
            path?: string;
            secure?: boolean;
            sameSite?: "lax" | "strict" | "none";
            maxAge?: number;
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
            },
        });
    }

    clear(): void {
        deleteCookie(this.#name);
    }
}
