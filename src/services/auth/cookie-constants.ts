// v4: environment fingerprints no longer include API or WebSocket URLs.
import { isLocalNetworkHost } from "../../utils/is-dev.js";
export const POLYESTER_SESSION_COOKIE_NAME = "polyester_session_4";
export const POLYESTER_LOGIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
export const POLYESTER_AUTH_TOKEN_COOKIE_NAME = "polyester_auth_token";

/** The request or browser location that determines a local auth-cookie name. */
export interface AuthCookieLocation {
    hostname: string;
    port: string;
    protocol: string;
}

/**
 * Keeps local development servers on different ports from sharing auth cookies.
 * Public hosts retain the stable production cookie names. A missing location is
 * intentionally treated as production; server callers handling a local request
 * must pass that request's URL or location.
 */
export function resolveAuthCookieName(name: string, location?: AuthCookieLocation): string {
    const currentLocation =
        location ??
        (typeof window === "undefined" ? undefined : (window.location as AuthCookieLocation));
    if (!currentLocation || !isLocalNetworkHost(currentLocation.hostname)) return name;

    const port = currentLocation.port || (currentLocation.protocol === "https:" ? "443" : "80");
    return `${name}_port_${port}`;
}
