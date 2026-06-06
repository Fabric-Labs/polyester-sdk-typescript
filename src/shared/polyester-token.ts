import { CookieManager } from "../utils/cookies.js";
import { POLYESTER_AUTH_TOKEN_COOKIE_NAME } from "./constants";

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
