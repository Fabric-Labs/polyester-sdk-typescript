import { PolyesterClient } from "./core-client.js";
import { polyesterToken } from "./shared/polyester-token.js";
import { WalletAuthService } from "./services/auth/wallet-auth.js";
import type { WalletConfig, PolyesterWallet } from "./wallet/types.js";
import { POLYESTER_API_BASE_URL } from "./shared/constants.js";
import type { SubaccountResolver } from "./services/subaccount-resolver.js";

export interface PolyesterBrowserClientUrls {
    apiUrl?: string;
    wsUrl?: string;
}

export interface PolyesterBrowserClientConfig {
    urls?: PolyesterBrowserClientUrls;
    /**
     * Wallet interface for signing.
     * Pass a wallet object or a factory function for lazy initialization.
     */
    wallet?: WalletConfig;
}

/**
 * A client for interacting with the Polyester DEX in the browser.
 */
export class PolyesterBrowserClient extends PolyesterClient {
    override readonly auth: WalletAuthService;

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

        // wire up WalletAuthService with SubaccountsService for createSubaccount support
        this.auth = new WalletAuthService({
            transports: { publicApi: this.transports.publicApi, authApi: this.transports.authApi },
            walletConfig: config.wallet,
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

    setWallet(wallet: PolyesterWallet | null): void {
        this.auth.setWallet(wallet);
    }
}
