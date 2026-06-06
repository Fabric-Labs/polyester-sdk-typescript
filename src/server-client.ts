import { PolyesterClient } from "./core-client.js";
import { POLYESTER_API_BASE_URL, POLYESTER_SESSION_COOKIE_NAME } from "./shared/constants.js";
import { POLYESTER_AUTH_TOKEN_COOKIE_NAME } from "./shared/constants.js";
import type {
    ActiveAccountInfo,
    AuthLoginMethod,
    SessionData,
} from "./shared/polyester-session.js";
import { type CookieGetter, getCookieValue } from "./utils/cookies.js";
import type { JwtAuthProvider, ApiKeyEd25519AuthProvider } from "./shared/transports.js";
import type { SubAccountResolver } from "./services/sub-account-resolver.js";

export interface ProviderServerData {
    isLoggedIn: boolean;
    provider: string | null;
    loginMethod: AuthLoginMethod | null;
    walletAddresses: { primaryWallet: string; smartAccount: string } | null;
    activeAccount: ActiveAccountInfo | null;
    polyesterToken: string | null;
    username: string | null;
}

export function parseSessionCookie(cookies: CookieGetter): ProviderServerData {
    const sessionValue = getCookieValue(cookies, POLYESTER_SESSION_COOKIE_NAME);
    const polyesterToken = getCookieValue(cookies, POLYESTER_AUTH_TOKEN_COOKIE_NAME) ?? null;

    let session: SessionData | null = null;
    if (sessionValue) {
        try {
            const decoded = decodeURIComponent(sessionValue);
            // handle legacy double-encoded cookies (value was previously encoded before passing to setCookie)
            const jsonStr = decoded.startsWith("%7B") ? decodeURIComponent(decoded) : decoded;
            session = JSON.parse(jsonStr) as SessionData;
        } catch {
            // invalid JSON
        }
    }

    return {
        isLoggedIn: !!session,
        provider: session?.provider ?? null,
        loginMethod: session?.loginMethod ?? null,
        walletAddresses: session
            ? { primaryWallet: session.primaryWallet, smartAccount: session.smartAccount }
            : null,
        activeAccount: session?.activeAccount ?? null,
        polyesterToken,
        username: session?.username ?? null,
    };
}

export interface PolyesterServerClientUrls {
    apiUrl?: string;
}

export interface PolyesterServerClientConfig {
    urls?: PolyesterServerClientUrls;
    wireFormat?: "binary" | "json";
    /** Full auth provider config. Takes precedence over `token` if both are provided. */
    auth?: JwtAuthProvider | ApiKeyEd25519AuthProvider;
    /** Session data parsed from cookies */
    session?: ProviderServerData;
}

export class PolyesterServerClient extends PolyesterClient {
    #hasAuth: boolean;
    #session: ProviderServerData;

    constructor(config: PolyesterServerClientConfig = {}) {
        const auth = config.auth ?? undefined;

        super({
            apiUrl: config.urls?.apiUrl ?? POLYESTER_API_BASE_URL,
            auth,
            wireFormat: config.wireFormat,
        });
        this.#hasAuth = !!auth;
        this.#session = config.session ?? {
            isLoggedIn: false,
            provider: null,
            loginMethod: null,
            walletAddresses: null,
            activeAccount: null,
            polyesterToken: null,
            username: null,
        };
    }

    /**
     * Creates a resolver that defaults subaccountId to the active subaccount from session.
     */
    protected override createSubaccountResolver(): SubAccountResolver {
        return {
            getDefaultSubAccountId: () => {
                const activeAccount = this.#session.activeAccount;
                if (activeAccount && !activeAccount.isMain) {
                    return activeAccount.accountId;
                }
                return null;
            },
            getActiveAccountId: () => this.#session.activeAccount?.accountId ?? null,
            getMainAccountId: () => this.#session.activeAccount?.mainAccountId ?? null,
        };
    }

    get isAuthenticated(): boolean {
        return this.#hasAuth;
    }

    get session(): ProviderServerData {
        return this.#session;
    }
}

export interface CreateServerClientFromCookiesParams {
    cookies: CookieGetter;
    urls?: PolyesterServerClientUrls;
}

export interface CreateServerClientFromRequestParams {
    request: Request;
    urls?: PolyesterServerClientUrls;
}

export function createPolyesterServerClient(
    config: PolyesterServerClientConfig = {},
): PolyesterServerClient {
    return new PolyesterServerClient(config);
}

export function createPolyesterServerClientFromCookies(
    params: CreateServerClientFromCookiesParams,
): PolyesterServerClient {
    const session = parseSessionCookie(params.cookies);

    return new PolyesterServerClient({
        urls: params.urls,
        session,
        auth: {
            kind: "jwt",
            getToken: () => session.polyesterToken ?? null,
        },
    });
}

export function createPolyesterServerClientFromRequest(
    params: CreateServerClientFromRequestParams,
): PolyesterServerClient {
    return createPolyesterServerClientFromCookies({
        cookies: params.request,
        urls: params.urls,
    });
}

export function getPolyesterTokenFromCookies(cookies: CookieGetter): string | null {
    return getCookieValue(cookies, POLYESTER_AUTH_TOKEN_COOKIE_NAME) ?? null;
}

export { POLYESTER_AUTH_TOKEN_COOKIE_NAME, POLYESTER_SESSION_COOKIE_NAME };
