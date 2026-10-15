import { installServiceGetters, type PolyesterServices } from "./client.js";
import {
    PolyesterServerCore,
    serverClientConfigFromCookies,
    serverClientConfigFromRequest,
    type CreateServerClientFromCookiesParams,
    type CreateServerClientFromRequestParams,
} from "./server-core.js";

export type {
    CreateServerClientFromCookiesParams,
    CreateServerClientFromRequestParams,
    PolyesterServerClientConfig,
    ServerSessionSnapshot,
} from "./server-core.js";

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- getters are installed below
export interface PolyesterServerClient extends PolyesterServices {}

/**
 * Server-side SDK client that can parse display-session cookies and verify
 * bearer-token sessions with the backend, with a lazy getter for every public service.
 */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- getters are installed below
export class PolyesterServerClient extends PolyesterServerCore {
    static {
        installServiceGetters(this);
    }
}

/**
 * Creates a server SDK client from a Request, cookie record, or synchronous cookie store.
 */
export function createPolyesterServerClientFromCookies(
    params: CreateServerClientFromCookiesParams,
): PolyesterServerClient {
    return new PolyesterServerClient(serverClientConfigFromCookies(params));
}

/**
 * Creates a server SDK client from a Request object.
 */
export function createPolyesterServerClientFromRequest(
    params: CreateServerClientFromRequestParams,
): PolyesterServerClient {
    return new PolyesterServerClient(serverClientConfigFromRequest(params));
}
