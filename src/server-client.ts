import {
    parsePolyesterClientConfig,
    pickPolyesterCatalogConfig,
    PolyesterClient,
    type PolyesterClientBaseConfig,
} from "./core-client.js";
import {
    POLYESTER_AUTH_TOKEN_COOKIE_NAME,
    POLYESTER_SESSION_COOKIE_NAME,
} from "./services/auth/cookie-constants.js";
import type { ServerSessionSnapshot } from "./services/auth/session.types.js";
import { emptyServerSessionSnapshot, parseServerSessionSnapshot } from "./services/auth/session.js";
import type { CookieGetter } from "./utils/cookies.js";
import type { JwtAuthProvider, ApiKeyEd25519AuthProvider } from "./shared/transports.js";
import type { SubaccountResolver } from "./services/subaccount-resolver.js";
import { isJwtValid } from "./utils/jwt.js";
import type { Me } from "./services/auth/auth.js";
import type { PolyesterEnvironment } from "./environment.js";
import { AuthenticationError, ConfigurationError } from "./shared/errors.js";

export type { ServerSessionSnapshot };

/**
 * Parses a serialized session cookie into SDK session data.
 */
export function parseSessionCookie(
    cookies: CookieGetter,
    environment: PolyesterEnvironment,
): ServerSessionSnapshot {
    return parseServerSessionSnapshot(cookies, environment);
}

/** Configuration for the server Polyester client. */
export type PolyesterServerClientConfig = PolyesterClientBaseConfig & {
    /** Auth provider config for HTTP/Connect endpoints. */
    auth?: JwtAuthProvider | ApiKeyEd25519AuthProvider;
    /** Bearer authentication and display-only session data parsed from cookies. */
    session?: ServerSessionSnapshot;
    /**
     * Use unsigned display-session `activeAccount` as the default subaccount for
     * calls that omit `subaccountId`. This preserves account-switcher intent for
     * apps that explicitly opt in; backend authorization must still decide what
     * the authenticated user can access.
     */
    useDisplaySessionActiveAccountAsDefault?: boolean;
};

/**
 * Server-side SDK client that can parse display-session cookies and verify bearer-token sessions with the backend.
 */
export class PolyesterServerClient extends PolyesterClient {
    #hasAuthProvider: boolean;
    #session: ServerSessionSnapshot;
    #useDisplaySessionActiveAccountAsDefault: boolean;

    constructor(config: PolyesterServerClientConfig) {
        config = parsePolyesterClientConfig(config);
        const auth = config.auth ?? undefined;

        super({
            environment: config.environment,
            interceptors: config.interceptors,
            auth,
            wireFormat: config.wireFormat,
            realtime: config.realtime,
            ...pickPolyesterCatalogConfig(config),
            transports: config.transports,
            realtimeClient: config.realtimeClient,
        });
        this.#hasAuthProvider = !!auth;
        this.#session = config.session ?? emptyServerSessionSnapshot();
        this.#useDisplaySessionActiveAccountAsDefault =
            config.useDisplaySessionActiveAccountAsDefault ?? false;
    }

    /**
     * Creates a resolver for server-side subaccount defaults. Display-session
     * `activeAccount` is only used as caller intent when explicitly enabled;
     * backend auth remains authoritative.
     */
    protected override createSubaccountResolver(): SubaccountResolver {
        return {
            getDefaultSubaccountId: () => {
                if (!this.#useDisplaySessionActiveAccountAsDefault) return null;

                const activeAccount = this.#session.activeAccount;
                if (activeAccount && !activeAccount.isMain) return activeAccount.accountId;
                return null;
            },
            getActiveAccountId: () => this.#session.activeAccount?.accountId ?? null,
            getMainAccountId: () => this.#session.activeAccount?.mainAccountId ?? null,
        };
    }

    get hasAuthProvider(): boolean {
        return this.#hasAuthProvider;
    }

    get hasBearerToken(): boolean {
        return !!this.#session.bearerToken;
    }

    get hasUsableBearerToken(): boolean {
        return isJwtValid(this.#session.bearerToken);
    }

    get hasDisplaySession(): boolean {
        return this.#session.hasDisplaySession;
    }

    get session(): ServerSessionSnapshot {
        return this.#session;
    }

    /**
     * Verifies the current server session. Returns null only when credentials
     * are absent or rejected as unauthenticated. Transport, configuration, and
     * other backend failures are rethrown so callers do not treat outages as logout.
     */
    async verifySession(): Promise<Me | null> {
        if (!this.#hasAuthProvider) return null;

        try {
            return await this.auth.me();
        } catch (error) {
            if (error instanceof AuthenticationError) return null;
            throw error;
        }
    }
}

type ServerClientFactoryBaseConfig<TConfig> = TConfig extends PolyesterClientBaseConfig
    ? Pick<
          TConfig,
          | "environment"
          | "interceptors"
          | "realtime"
          | "wireFormat"
          | "catalog"
          | "catalogSnapshot"
          | "catalogCell"
          | "transports"
          | "realtimeClient"
      >
    : never;

/** Parameters for creating a server client from cookies. */
export type CreateServerClientFromCookiesParams =
    ServerClientFactoryBaseConfig<PolyesterClientBaseConfig> & {
        /**
         * A Request, name-value record, or synchronous cookie store whose `get`
         * method returns either a string or an object with a string `value`.
         * Await asynchronous framework cookie helpers before passing their result.
         */
        cookies: CookieGetter;
        /**
         * Use unsigned display-session `activeAccount` as the default subaccount for
         * calls that omit `subaccountId`. This is caller intent from UI hydration,
         * not proof of authority; backend authorization remains authoritative.
         */
        useDisplaySessionActiveAccountAsDefault?: boolean;
    };

/** Parameters for creating a server client from a request. */
export type CreateServerClientFromRequestParams =
    ServerClientFactoryBaseConfig<PolyesterClientBaseConfig> & {
        request: Request;
        /**
         * Use unsigned display-session `activeAccount` as the default subaccount for
         * calls that omit `subaccountId`. This is caller intent from UI hydration,
         * not proof of authority; backend authorization remains authoritative.
         */
        useDisplaySessionActiveAccountAsDefault?: boolean;
    };

/**
 * Creates a server SDK client from a Request, cookie record, or synchronous cookie store.
 */
export function createPolyesterServerClientFromCookies(
    params: CreateServerClientFromCookiesParams,
): PolyesterServerClient {
    const session = parseSessionCookie(params.cookies, params.environment);
    const auth = isJwtValid(session.bearerToken)
        ? ({
              kind: "jwt",
              getToken: () => session.bearerToken,
          } satisfies JwtAuthProvider)
        : undefined;

    return new PolyesterServerClient({
        environment: params.environment,
        interceptors: params.interceptors,
        session,
        wireFormat: params.wireFormat,
        realtime: params.realtime,
        ...pickPolyesterCatalogConfig(params),
        transports: params.transports,
        realtimeClient: params.realtimeClient,
        auth,
        useDisplaySessionActiveAccountAsDefault: params.useDisplaySessionActiveAccountAsDefault,
    });
}

/**
 * Creates a server SDK client from a Request object.
 */
export function createPolyesterServerClientFromRequest(
    params: CreateServerClientFromRequestParams,
): PolyesterServerClient {
    if (!(params?.request instanceof Request)) {
        throw new ConfigurationError("request is required and must be a Request.");
    }
    return createPolyesterServerClientFromCookies({
        cookies: params.request,
        environment: params.environment,
        interceptors: params.interceptors,
        wireFormat: params.wireFormat,
        realtime: params.realtime,
        ...pickPolyesterCatalogConfig(params),
        transports: params.transports,
        realtimeClient: params.realtimeClient,
        useDisplaySessionActiveAccountAsDefault: params.useDisplaySessionActiveAccountAsDefault,
    });
}

/**
 * Reads a bearer token from supported auth cookies.
 */
export function getBearerTokenFromCookies(
    cookies: CookieGetter,
    environment: PolyesterEnvironment,
): string | null {
    return parseSessionCookie(cookies, environment).bearerToken;
}

export { POLYESTER_AUTH_TOKEN_COOKIE_NAME, POLYESTER_SESSION_COOKIE_NAME };
