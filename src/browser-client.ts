import {
    parsePolyesterClientConfig,
    pickPolyesterCatalogConfig,
    PolyesterClient,
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
 * A client for interacting with the Polyester DEX in the browser.
 */
export class PolyesterBrowserClient extends PolyesterClient {
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

        super(
            {
                environment: config.environment,
                interceptors: config.interceptors,
                auth: { kind: "jwt", getToken },
                wireFormat: config.wireFormat,
                ...pickPolyesterCatalogConfig(config),
                transports: config.transports,
                realtimeClient: config.realtimeClient,
                realtime: {
                    hasAuth: () => !!getToken(),
                    ...config.realtime,
                },
            },
            {
                createAuth: ({ transports, realtime, subaccounts, environment }) =>
                    new AccountSignerAuthService({
                        transports,
                        accountSignerConfig: config.accountSigner,
                        environment,
                        subaccounts,
                        realtime,
                        tokenStorage,
                        sessionStore,
                    }),
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
