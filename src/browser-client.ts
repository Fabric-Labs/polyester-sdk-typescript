import { PolyesterClient, type PolyesterClientBaseConfig } from "./core-client.js";
import { getEnvironmentBoundPolyesterToken } from "./services/auth/token.js";
import { AccountSignerAuthService } from "./services/auth/account-signer-auth.js";
import type { AccountSignerConfig, AccountSigner } from "./account-signer/types.js";
import type { SubaccountResolver } from "./services/subaccount-resolver.js";

export interface PolyesterBrowserClientConfig extends Omit<PolyesterClientBaseConfig, "auth"> {
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
    declare readonly auth: AccountSignerAuthService;

    constructor(config: PolyesterBrowserClientConfig) {
        const getToken = () => getEnvironmentBoundPolyesterToken(config.environment.fingerprint);

        super(
            {
                environment: config.environment,
                interceptors: config.interceptors,
                auth: { kind: "jwt", getToken },
                wireFormat: config.wireFormat,
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

    setAccountSigner(accountSigner: AccountSigner | null): void {
        this.auth.setAccountSigner(accountSigner);
    }
}
