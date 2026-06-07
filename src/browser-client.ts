import { PolyesterClient } from "./core-client.js";
import { polyesterToken } from "./shared/polyester-token.js";
import { AccountSignerAuthService } from "./services/auth/account-signer-auth.js";
import type { AccountSignerConfig, AccountSigner } from "./account-signer/types.js";
import { POLYESTER_API_BASE_URL } from "./shared/constants.js";
import type { SubaccountResolver } from "./services/subaccount-resolver.js";

export interface PolyesterBrowserClientUrls {
    apiUrl?: string;
    wsUrl?: string;
}

export interface PolyesterBrowserClientConfig {
    urls?: PolyesterBrowserClientUrls;
    /**
     * Account signer interface for authentication.
     * Pass a signer object or a factory function for lazy initialization.
     */
    accountSigner?: AccountSignerConfig;
}

/**
 * A client for interacting with the Polyester DEX in the browser.
 */
export class PolyesterBrowserClient extends PolyesterClient {
    override readonly auth: AccountSignerAuthService;

    constructor(config: PolyesterBrowserClientConfig = {}) {
        const apiUrl = config.urls?.apiUrl ?? POLYESTER_API_BASE_URL;

        super({
            apiUrl,
            auth: { kind: "jwt", getToken: () => polyesterToken.get() },
            realtime: {
                wsUrl: config.urls?.wsUrl,
                hasAuth: () => !!polyesterToken.get(),
            },
        });

        // wire up AccountSignerAuthService with SubaccountsService for createSubaccount support
        this.auth = new AccountSignerAuthService({
            transports: { publicApi: this.transports.publicApi, authApi: this.transports.authApi },
            accountSignerConfig: config.accountSigner,
            subaccounts: this.subaccounts,
            realtime: this.realtime,
        });
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

    setAccountSigner(accountSigner: AccountSigner | null): void {
        this.auth.setAccountSigner(accountSigner);
    }
}
