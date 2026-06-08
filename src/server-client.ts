import { PolyesterClient, type PolyesterClientBaseConfig } from "./core-client.js";
import {
    POLYESTER_AUTH_TOKEN_COOKIE_NAME,
    POLYESTER_SESSION_COOKIE_NAME,
} from "./services/auth/cookie-constants.js";
import type {
    ActiveAccountInfo,
    AuthLoginMethod,
    SessionData,
} from "./services/auth/session.types.js";
import { parseSessionData } from "./services/auth/session.schemas.js";
import { type CookieGetter, getCookieValue } from "./utils/cookies.js";
import type { JwtAuthProvider, ApiKeyEd25519AuthProvider } from "./shared/transports.js";
import type { SubaccountResolver } from "./services/subaccount-resolver.js";
import { isJwtValid } from "./utils/jwt.js";
import type { Me } from "./services/auth/auth.js";
import type { PolyesterEnvironment } from "./environment.js";

/**
 * Display-only session data parsed from client-readable cookies.
 *
 * This data is unsigned and must not be used for authorization. Use
 * `verifySession()` to confirm the bearer token with the backend before
 * treating a request as authenticated.
 */
export interface ServerSessionSnapshot {
    environmentFingerprint: string | null;
    hasDisplaySession: boolean;
    provider: string | null;
    loginMethod: AuthLoginMethod | null;
    accountAddresses: { ownerAddress: string; accountAddress: string } | null;
    activeAccount: ActiveAccountInfo | null;
    bearerToken: string | null;
    username: string | null;
}

function emptyServerSessionSnapshot(): ServerSessionSnapshot {
    return {
        environmentFingerprint: null,
        hasDisplaySession: false,
        provider: null,
        loginMethod: null,
        accountAddresses: null,
        activeAccount: null,
        bearerToken: null,
        username: null,
    };
}

/**
 * Parses a serialized session cookie into SDK session data.
 */
export function parseSessionCookie(
    cookies: CookieGetter,
    environment: PolyesterEnvironment,
): ServerSessionSnapshot {
    const sessionValue = getCookieValue(cookies, POLYESTER_SESSION_COOKIE_NAME);
    const bearerToken = getCookieValue(cookies, POLYESTER_AUTH_TOKEN_COOKIE_NAME) ?? null;

    let session: SessionData | null = null;
    if (sessionValue) {
        try {
            // handle legacy double-encoded cookies (value was previously encoded before passing to setCookie)
            const jsonStr = sessionValue.startsWith("%7B")
                ? decodeURIComponent(sessionValue)
                : sessionValue;
            session = parseSessionData(JSON.parse(jsonStr));
        } catch {
            // invalid JSON
        }
    }

    if (!session || session.environmentFingerprint !== environment.fingerprint) {
        return emptyServerSessionSnapshot();
    }

    return {
        environmentFingerprint: session.environmentFingerprint,
        hasDisplaySession: true,
        provider: session.provider,
        loginMethod: session.loginMethod,
        accountAddresses: {
            ownerAddress: session.primaryWallet,
            accountAddress: session.smartAccount,
        },
        activeAccount: session.activeAccount ?? null,
        bearerToken,
        username: session.username ?? null,
    };
}

export interface PolyesterServerClientConfig extends PolyesterClientBaseConfig {
    /** Auth provider config for HTTP/Connect endpoints. */
    auth?: JwtAuthProvider | ApiKeyEd25519AuthProvider;
    /** Display-only session data parsed from cookies. Not proof of authentication. */
    session?: ServerSessionSnapshot;
    /**
     * Use unsigned display-session `activeAccount` as the default subaccount for
     * calls that omit `subaccountId`. This preserves account-switcher intent for
     * apps that explicitly opt in; backend authorization must still decide what
     * the authenticated user can access.
     */
    useDisplaySessionActiveAccountAsDefault?: boolean;
}

/**
 * Server-side SDK client that can parse display-session cookies and verify bearer-token sessions with the backend.
 */
export class PolyesterServerClient extends PolyesterClient {
    #hasAuthProvider: boolean;
    #session: ServerSessionSnapshot;
    #useDisplaySessionActiveAccountAsDefault: boolean;

    constructor(config: PolyesterServerClientConfig) {
        const auth = config.auth ?? undefined;

        super({
            environment: config.environment,
            interceptors: config.interceptors,
            auth,
            wireFormat: config.wireFormat,
            realtime: config.realtime,
            refreshCatalogs: config.refreshCatalogs,
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
     * Verifies the current server session and returns its auth state.
     */
    async verifySession(): Promise<Me | null> {
        if (!this.#hasAuthProvider) return null;

        try {
            return await this.auth.me();
        } catch {
            return null;
        }
    }
}

export interface CreateServerClientFromCookiesParams extends Pick<
    PolyesterClientBaseConfig,
    "environment" | "interceptors" | "realtime" | "wireFormat" | "refreshCatalogs"
> {
    cookies: CookieGetter;
    /**
     * Use unsigned display-session `activeAccount` as the default subaccount for
     * calls that omit `subaccountId`. This is caller intent from UI hydration,
     * not proof of authority; backend authorization remains authoritative.
     */
    useDisplaySessionActiveAccountAsDefault?: boolean;
}

export interface CreateServerClientFromRequestParams extends Pick<
    PolyesterClientBaseConfig,
    "environment" | "interceptors" | "realtime" | "wireFormat" | "refreshCatalogs"
> {
    request: Request;
    /**
     * Use unsigned display-session `activeAccount` as the default subaccount for
     * calls that omit `subaccountId`. This is caller intent from UI hydration,
     * not proof of authority; backend authorization remains authoritative.
     */
    useDisplaySessionActiveAccountAsDefault?: boolean;
}

/**
 * Creates a server SDK client from a cookie source.
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
        refreshCatalogs: params.refreshCatalogs,
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
    return createPolyesterServerClientFromCookies({
        cookies: params.request,
        environment: params.environment,
        interceptors: params.interceptors,
        wireFormat: params.wireFormat,
        realtime: params.realtime,
        refreshCatalogs: params.refreshCatalogs,
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
