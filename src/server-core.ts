import {
    parsePolyesterClientConfig,
    pickPolyesterCatalogConfig,
    PolyesterCore,
    type PolyesterClientBaseConfig,
} from "./core-client.js";
import {
    POLYESTER_AUTH_TOKEN_COOKIE_NAME,
    POLYESTER_SESSION_COOKIE_NAME,
    type AuthCookieLocation,
} from "./services/auth/cookie-constants.js";
import type { ServerSessionSnapshot } from "./services/auth/session.types.js";
import {
    emptyServerSessionSnapshot,
    parseServerSessionSnapshot,
    type ServerSessionCookieOptions,
} from "./services/auth/session.js";
import type { CookieGetter } from "./utils/cookies.js";
import type { JwtAuthProvider, ApiKeyEd25519AuthProvider } from "./shared/transports.js";
import {
    createBrokerApiKeyInterceptor,
    type BrokerApiKeyAuthProvider,
} from "./shared/broker-auth.js";
import type { SubaccountResolver } from "./services/subaccount-resolver.js";
import { isJwtValid } from "./utils/jwt.js";
import type { Me } from "./services/auth/auth.js";
import type { PolyesterEnvironment } from "./environment.js";
import { AuthenticationError, ConfigurationError } from "./shared/errors.js";
import { toPolyesterError } from "./shared/connect-error-mapping.js";

export type { ServerSessionSnapshot };

/**
 * Parses a serialized session cookie into SDK session data.
 */
export function parseSessionCookie(
    cookies: CookieGetter,
    environment: PolyesterEnvironment,
    options?: ServerSessionCookieOptions,
): ServerSessionSnapshot {
    return parseServerSessionSnapshot(cookies, environment, options);
}

type ServerClientBaseConfig<TConfig> = TConfig extends PolyesterClientBaseConfig
    ? Omit<TConfig, "auth">
    : never;

/** Configuration for the server Polyester client. */
export type PolyesterServerClientConfig = ServerClientBaseConfig<PolyesterClientBaseConfig> & {
    /**
     * Auth provider config for HTTP/Connect endpoints. `broker-api-key` is
     * server-only: it authenticates the QuickSwap broker API and nothing else.
     */
    auth?: JwtAuthProvider | ApiKeyEd25519AuthProvider | BrokerApiKeyAuthProvider;
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
 * Tree-shakable server client core that can parse display-session cookies and verify
 * bearer-token sessions with the backend. Reach other services through
 * `@polyester/sdk/services/*` accessors, or use `PolyesterServerClient` for a getter per service.
 */
export class PolyesterServerCore extends PolyesterCore {
    #hasAuthProvider: boolean;
    #session: ServerSessionSnapshot;
    #useDisplaySessionActiveAccountAsDefault: boolean;

    constructor(config: PolyesterServerClientConfig) {
        config = parsePolyesterClientConfig(config);
        const brokerAuth = config.auth?.kind === "broker-api-key" ? config.auth : undefined;
        // A broker key is not a user credential: sessions, realtime and every
        // other service stay unauthenticated on a broker client.
        const auth =
            config.auth?.kind === "broker-api-key" ? undefined : (config.auth ?? undefined);
        const interceptors = brokerAuth
            ? [createBrokerApiKeyInterceptor(brokerAuth), ...(config.interceptors ?? [])]
            : config.interceptors;

        super({
            environment: config.environment,
            interceptors,
            auth,
            wireFormat: config.wireFormat,
            fetch: config.fetch,
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

    /** Whether a user credential (JWT or Ed25519 API key) is configured; a broker key is not one. */
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
            const mappedError = toPolyesterError(error);
            if (mappedError instanceof AuthenticationError) return null;
            throw mappedError;
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
          | "fetch"
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
         * The page or request location that supplied `cookies`. Required for
         * local framework cookie stores so their port-scoped auth cookies can
         * be parsed; a `Request` source derives this from `request.url`.
         */
        cookieLocation?: AuthCookieLocation;
        /** Base name configured for the browser bearer-token cookie. */
        tokenCookieName?: string;
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
        /** Base name configured for the browser bearer-token cookie. */
        tokenCookieName?: string;
        /**
         * Use unsigned display-session `activeAccount` as the default subaccount for
         * calls that omit `subaccountId`. This is caller intent from UI hydration,
         * not proof of authority; backend authorization remains authoritative.
         */
        useDisplaySessionActiveAccountAsDefault?: boolean;
    };

/**
 * Resolves server client config from a Request, cookie record, or synchronous cookie store.
 */
export function serverClientConfigFromCookies(
    params: CreateServerClientFromCookiesParams,
): PolyesterServerClientConfig {
    const session = parseSessionCookie(params.cookies, params.environment, {
        cookieLocation: params.cookieLocation,
        tokenCookieName: params.tokenCookieName,
    });
    const auth = isJwtValid(session.bearerToken)
        ? ({
              kind: "jwt",
              getToken: () => session.bearerToken,
          } satisfies JwtAuthProvider)
        : undefined;

    return {
        environment: params.environment,
        interceptors: params.interceptors,
        session,
        wireFormat: params.wireFormat,
        fetch: params.fetch,
        realtime: params.realtime,
        ...pickPolyesterCatalogConfig(params),
        transports: params.transports,
        realtimeClient: params.realtimeClient,
        auth,
        useDisplaySessionActiveAccountAsDefault: params.useDisplaySessionActiveAccountAsDefault,
    };
}

/**
 * Resolves server client config from a Request object.
 */
export function serverClientConfigFromRequest(
    params: CreateServerClientFromRequestParams,
): PolyesterServerClientConfig {
    if (!(params?.request instanceof Request)) {
        throw new ConfigurationError("request is required and must be a Request.");
    }
    return serverClientConfigFromCookies({
        cookies: params.request,
        cookieLocation: new URL(params.request.url),
        tokenCookieName: params.tokenCookieName,
        environment: params.environment,
        interceptors: params.interceptors,
        wireFormat: params.wireFormat,
        fetch: params.fetch,
        realtime: params.realtime,
        ...pickPolyesterCatalogConfig(params),
        transports: params.transports,
        realtimeClient: params.realtimeClient,
        useDisplaySessionActiveAccountAsDefault: params.useDisplaySessionActiveAccountAsDefault,
    });
}

/**
 * Creates a server client core from a Request, cookie record, or synchronous cookie store.
 */
export function createPolyesterServerCoreFromCookies(
    params: CreateServerClientFromCookiesParams,
): PolyesterServerCore {
    return new PolyesterServerCore(serverClientConfigFromCookies(params));
}

/**
 * Creates a server client core from a Request object.
 */
export function createPolyesterServerCoreFromRequest(
    params: CreateServerClientFromRequestParams,
): PolyesterServerCore {
    return new PolyesterServerCore(serverClientConfigFromRequest(params));
}

/**
 * Reads a bearer token from supported auth cookies.
 */
export function getBearerTokenFromCookies(
    cookies: CookieGetter,
    environment: PolyesterEnvironment,
    options?: ServerSessionCookieOptions,
): string | null {
    return parseSessionCookie(cookies, environment, options).bearerToken;
}

export { POLYESTER_AUTH_TOKEN_COOKIE_NAME, POLYESTER_SESSION_COOKIE_NAME };
