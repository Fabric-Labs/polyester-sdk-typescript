import { installServiceGetters, type PolyesterServices } from "./client.js";
import { quickSwapService } from "./services/quickswap/service.js";
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

/**
 * Services only the server client exposes, keyed by getter name. They are kept
 * out of `POLYESTER_SERVICES`, which the browser client shares, because their
 * credentials must never reach a browser.
 */
export const POLYESTER_SERVER_SERVICES = {
    quickSwap: quickSwapService,
};

/** Getters for the server-only services. */
export type PolyesterServerServices = {
    readonly [K in keyof typeof POLYESTER_SERVER_SERVICES]: ReturnType<
        (typeof POLYESTER_SERVER_SERVICES)[K]
    >;
};

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- getters are installed below
export interface PolyesterServerClient extends PolyesterServices, PolyesterServerServices {}

/**
 * Server-side SDK client that can parse display-session cookies and verify
 * bearer-token sessions with the backend, with a lazy getter for every public service.
 */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- getters are installed below
export class PolyesterServerClient extends PolyesterServerCore {
    static {
        installServiceGetters(this);
        installServiceGetters(this, POLYESTER_SERVER_SERVICES);
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
