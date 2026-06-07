import { CookieManager } from "../../utils/cookies.js";
import { POLYESTER_AUTH_TOKEN_COOKIE_NAME } from "./cookie-constants.js";
import { polyesterSession } from "./session.js";

/**
 * A singleton for managing the polyester token cookie
 * on the client side.
 *
 * @example
 * ```ts
 * // get the current token
 * const token = polyesterToken.get();
 * // or set a new token
 * polyesterToken.set("something-else");
 * // or delete the cookie
 * polyesterToken.clear();
 * ```
 */
export const polyesterToken = new CookieManager({ name: POLYESTER_AUTH_TOKEN_COOKIE_NAME });

export function getEnvironmentBoundPolyesterToken(environmentFingerprint: string): string | null {
    const token = polyesterToken.get();
    if (!token) return null;

    const session = polyesterSession.get();
    if (session?.environmentFingerprint !== environmentFingerprint) {
        polyesterToken.clear();
        if (session) polyesterSession.clear();
        return null;
    }

    return token;
}
