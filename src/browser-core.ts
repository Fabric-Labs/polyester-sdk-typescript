import {
    parsePolyesterClientConfig,
    pickPolyesterCatalogConfig,
    PolyesterCore,
    type PolyesterClientBaseConfig,
} from "./core-client.js";
import { AccountSignerAuthService } from "./services/auth/account-signer-auth.js";
import type { AccountSignerConfig, AccountSigner } from "./account-signer/types.js";
import type { SubaccountResolver } from "./services/subaccount-resolver.js";
import {
    createMemoryAuthTokenStorage,
    type AuthTokenStorage,
} from "./services/auth/token-storage.js";
import { AuthSessionStore } from "./services/auth/session.js";
import type { Interceptor } from "@connectrpc/connect";
import { toPolyesterError } from "./shared/connect-error-mapping.js";
import { loadErrorDetailDecoders } from "./shared/error-detail.js";
import { AuthenticationError } from "./shared/errors.js";

/**
 * Ends the session when the backend rejects the bearer token a request actually sent.
 * Sits just inside the JWT auth interceptor so it sees the attached header.
 */
function createRejectedTokenInterceptor(
    getAuth: () => AccountSignerAuthService | undefined,
): Interceptor {
    return (next) => async (req) => {
        try {
            return await next(req);
        } catch (error) {
            const token = req.header.get("Authorization")?.replace(/^Bearer /u, "");
            if (token) {
                // Decoders let MFA and other auth-detail rejections map to their own classes.
                await loadErrorDetailDecoders(error);
                if (toPolyesterError(error) instanceof AuthenticationError) {
                    getAuth()?.handleRejectedToken(token);
                }
            }
            throw error;
        }
    };
}

type BrowserClientBaseConfig<TConfig> = TConfig extends PolyesterClientBaseConfig
    ? Omit<TConfig, "auth">
    : never;

/** Configuration for the browser Polyester client. */
export type PolyesterBrowserClientConfig = BrowserClientBaseConfig<PolyesterClientBaseConfig> & {
    /**
     * Account signer interface for authentication.
     * Pass a signer object or a factory function for lazy initialization.
     */
    accountSigner?: AccountSignerConfig;
    /**
     * Storage for browser bearer tokens. Defaults to per-client memory storage.
     * Use createCookieAuthTokenStorage() to opt into reload/SSR persistence.
     */
    tokenStorage?: AuthTokenStorage;
};

/**
 * Tree-shakable browser client core: account-signer auth plus transports, realtime,
 * and catalogs. Reach other services through `@polyester/sdk/services/*` accessors,
 * or use `PolyesterBrowserClient` for a getter per service.
 */
export class PolyesterBrowserCore extends PolyesterCore {
    // The base class builds `auth` through the `createAuth` runtime factory we
    // pass below, so the lazily-constructed instance is always an
    // AccountSignerAuthService — this override only narrows the type.
    override get auth(): AccountSignerAuthService {
        return super.auth as AccountSignerAuthService;
    }

    constructor(config: PolyesterBrowserClientConfig) {
        config = parsePolyesterClientConfig(config);
        const tokenStorage = config.tokenStorage ?? createMemoryAuthTokenStorage();
        const sessionStore = new AuthSessionStore({
            environmentFingerprint: config.environment.fingerprint,
        });
        const getToken = () => sessionStore.getEnvironmentBoundToken(tokenStorage);
        let auth: AccountSignerAuthService | undefined;

        super(
            {
                environment: config.environment,
                interceptors: [
                    createRejectedTokenInterceptor(() => auth),
                    ...(config.interceptors ?? []),
                ],
                auth: { kind: "jwt", getToken },
                wireFormat: config.wireFormat,
                fetch: config.fetch,
                ...pickPolyesterCatalogConfig(config),
                transports: config.transports,
                realtimeClient: config.realtimeClient,
                realtime: {
                    hasAuth: () => !!getToken(),
                    ...config.realtime,
                },
            },
            {
                createAuth: ({ transports, realtime, loadSubaccounts, environment }) =>
                    (auth = new AccountSignerAuthService({
                        transports,
                        accountSignerConfig: config.accountSigner,
                        environment,
                        subaccounts: loadSubaccounts,
                        realtime,
                        tokenStorage,
                        sessionStore,
                    })),
            },
        );
    }

    /**
     * Creates a resolver that defaults subaccountId to the active subaccount.
     * The getter is called lazily when service methods are invoked.
     */
    protected override createSubaccountResolver(): SubaccountResolver {
        return {
            getDefaultSubaccountId: () => {
                const state = this.auth.getState();
                if (state.activeAccount && !state.activeAccount.isMain) {
                    return state.activeAccount.accountId;
                }
                return null;
            },
            getActiveAccountId: () => this.auth.getState().activeAccount?.accountId ?? null,
            getMainAccountId: () => this.auth.getState().mainAccountId ?? null,
        };
    }

    /**
     * Sets the account signer used for authenticated browser requests.
     */
    setAccountSigner(accountSigner: AccountSigner | null): void {
        this.auth.setAccountSigner(accountSigner);
    }
}
