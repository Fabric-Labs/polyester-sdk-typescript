import { CookieManager } from "../utils/cookies.js";
import { POLYESTER_BRIDGE_TOKEN_COOKIE_NAME } from "./constants.js";

/**
 * A singleton for managing the bridge token cookie
 * on the client side.
 *
 * @example
 * ```ts
 * // get the current token
 * const token = bridgeToken.get();
 * // or set a new token
 * bridgeToken.set("something-else");
 * // or delete the cookie
 * bridgeToken.clear();
 * ```
 */
export const bridgeToken = new CookieManager({ name: POLYESTER_BRIDGE_TOKEN_COOKIE_NAME });
