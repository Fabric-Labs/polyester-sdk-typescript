import { AuthService, type AuthServiceTransports } from "./auth.js";
import { polyesterToken } from "./token.js";
import { getEnvironmentBoundPolyesterToken } from "./token.js";
import { polyesterSession } from "./session.js";
import { POLYESTER_LOGIN_COOKIE_MAX_AGE } from "./cookie-constants.js";
import type { AccountSigner, AccountSignerConfig, HexAddress } from "../../account-signer/types.js";
import { assertAccountSigner, resolveAccountSigner } from "../../account-signer/types.js";
import { EventEmitter } from "../../utils/event-emitter.js";
import { isJwtValid, getJwtTimeToExpiry } from "../../utils/jwt.js";
import type { SubaccountsService } from "../subaccounts/index.js";
import type {
    AuthState,
    AuthHydrationData,
    AuthLoginMethod,
    SessionData,
} from "./session.types.js";
import type { RealtimeClient } from "../../realtime/index.js";
import type { PolyesterEnvironment } from "../../environment.js";

export interface AccountSignerAuthEvents {
    authenticated: { accountId: string; username: string };
    loggedOut: void;
    error: { code: string; message: string };
    servicesReady: void;
    stateChange: AuthState;
}

export interface LoginResult {
    accountId: string;
    username: string;
    expiresAt: Date;
}

export interface LoginOptions {
    /**
     * The wallet provider to use for login.
     */
    provider: "metamask" | "turnkey" | "other";
    loginMethod?: AuthLoginMethod | null;
}

export interface CreateSubaccountParams {
    /** The account signer for the new subaccount (caller derives this, e.g. via Turnkey saltNonce) */
    accountSigner: AccountSigner;
    /** Optional human-readable label for this subaccount */
    label?: string;
    /** Wallet provider hint (e.g. "turnkey", "metamask"). Defaults to "wallet" */
    walletProvider?: string;
}

export interface CreateSubaccountResult {
    subaccountId: string;
}

export class AccountSignerAuthService extends AuthService {
    readonly events = new EventEmitter<AccountSignerAuthEvents>();

    #accountSignerConfig: AccountSignerConfig | undefined;
    #accountSigner: AccountSigner | null = null;
    #isAuthenticated = false;
    #mainAccountId: string | null = null;
    #activeAccountId: string | null = null;
    #subaccounts: SubaccountsService;
    #walletProvider: "metamask" | "turnkey" | "other" | undefined = undefined;
    #loginMethod: AuthLoginMethod | null = null;
    #environmentFingerprint: string;

    constructor({
        transports,
        accountSignerConfig,
        environment,
        subaccounts,
        realtime,
    }: {
        transports: AuthServiceTransports;
        accountSignerConfig?: AccountSignerConfig;
        environment: PolyesterEnvironment;
        subaccounts: SubaccountsService;
        realtime: RealtimeClient;
    }) {
        super(transports, realtime);

        this.#accountSignerConfig = accountSignerConfig;
        this.#environmentFingerprint = environment.fingerprint;
        this.#subaccounts = subaccounts;
    }

    /**
     * Set or update the subaccounts service. Useful for lazy initialization.
     */
    setSubaccountsService(subaccounts: SubaccountsService): void {
        this.#subaccounts = subaccounts;
    }

    /**
     * Set or update the account signer. Useful for lazy signer initialization.
     */
    setAccountSigner(accountSigner: AccountSigner | null): void {
        if (accountSigner) this.#assertAccountSignerEnvironment(accountSigner);
        this.#accountSigner = accountSigner;
        this.#notifyStateChange();
    }

    /**
     * Get the current account signer if available.
     */
    getAccountSigner(): AccountSigner | null {
        return this.#accountSigner;
    }

    /**
     * Login with the configured account signer.
     * Requests a nonce, signs it, and authenticates with Polyester backend.
     */
    async login(options: LoginOptions): Promise<LoginResult> {
        const { provider, loginMethod } = options;

        const accountSigner = await this.#resolveAccountSigner();

        if (!accountSigner) {
            throw new Error(
                "No account signer configured. Call setAccountSigner() or pass accountSigner in config.",
            );
        }

        const smartAccountAddress = accountSigner.accountAddress;
        const ownerAddress = accountSigner.ownerAddress ?? accountSigner.accountAddress;

        const { nonce } = await this.requestLoginNonce(smartAccountAddress);

        const message = `Polyester Login\n\nNonce: ${nonce}`;
        const signature = await accountSigner.signMessage(message);

        const response = await this.loginWithWallet({
            smartAccountAddress,
            nonce,
            signature,
            primaryWalletAddress: ownerAddress,
            walletProvider: provider,
        });

        const environmentSession = this.#getEnvironmentSession();
        const resolvedLoginMethod =
            loginMethod ??
            this.#loginMethod ??
            environmentSession?.loginMethod ??
            (provider === "metamask" ? "metamask" : null);

        polyesterToken.set(response.accessToken, { maxAge: POLYESTER_LOGIN_COOKIE_MAX_AGE });
        this.#isAuthenticated = true;
        this.#mainAccountId = response.accountId;
        this.#activeAccountId = response.accountId;
        this.#walletProvider = provider;
        this.#loginMethod = resolvedLoginMethod;

        // set full session for SSR hydration
        polyesterSession.set({
            environmentFingerprint: this.#environmentFingerprint,
            provider: provider,
            loginMethod: resolvedLoginMethod,
            primaryWallet: ownerAddress,
            smartAccount: smartAccountAddress,
            activeAccount: {
                accountId: response.accountId,
                isMain: true,
                mainAccountId: response.accountId,
            },
            username: response.username ?? undefined,
        });

        this.#notifyStateChange();

        this.events.emit("authenticated", {
            accountId: response.accountId,
            username: response.username,
        });

        const expiresAt = response.expiresAt
            ? new Date(
                  Number(response.expiresAt.seconds) * 1000 +
                      (response.expiresAt.nanos ?? 0) / 1_000_000,
              )
            : new Date();

        return {
            accountId: response.accountId,
            username: response.username,
            expiresAt,
        };
    }

    /**
     * Hydrate auth state from server-provided data. This is synchronous and avoids
     * the flash of unauthenticated content by not making any network calls.
     */
    hydrateAuthState(state: AuthHydrationData): void {
        if (typeof document !== "undefined") {
            const existingToken = getEnvironmentBoundPolyesterToken(this.#environmentFingerprint);
            if (!existingToken || !isJwtValid(existingToken)) return;
        }

        const existingSession = this.#getEnvironmentSession();
        this.#walletProvider = existingSession?.provider ?? this.#walletProvider;
        this.#loginMethod = existingSession?.loginMethod ?? this.#loginMethod;

        this.#isAuthenticated = true;
        this.#mainAccountId = state.mainAccountId;
        this.#activeAccountId = state.activeAccountId ?? state.mainAccountId;

        if (state.smartAccountAddress) {
            this.#accountSigner = {
                environmentFingerprint: this.#environmentFingerprint,
                accountAddress: state.smartAccountAddress as HexAddress,
                ownerAddress: state.ownerAddress as HexAddress,
                signMessage: async () => {
                    throw new Error(
                        "Hydrated account signer cannot sign. Call setAccountSigner() with a real signer.",
                    );
                },
            };
        }

        this.#notifyStateChange();
    }

    /**
     * Restore an existing session from stored tokens.
     * Makes a network call to validate the session - use `hydrateAuthState()` for SSR hydration.
     * @returns User data if session restored, null otherwise
     */
    async restoreSession(): Promise<{ accountId: string; username: string } | null> {
        const existingToken = getEnvironmentBoundPolyesterToken(this.#environmentFingerprint);

        if (!existingToken || !isJwtValid(existingToken)) {
            this.#clearExpiredSessionState();
            return null;
        }

        try {
            const me = await this.me();
            this.#isAuthenticated = true;
            this.#mainAccountId = me.accountId;

            // preserve active account if already set (e.g. via hydration), otherwise use main
            const existingSession = this.#getEnvironmentSession();
            this.#walletProvider = existingSession?.provider ?? this.#walletProvider;
            this.#loginMethod = existingSession?.loginMethod ?? this.#loginMethod;
            if (!this.#activeAccountId) {
                this.#activeAccountId = existingSession?.activeAccount?.accountId ?? me.accountId;
            }

            // use existing account signer if set, otherwise try to resolve from config
            if (!this.#accountSigner) {
                this.#accountSigner = await resolveAccountSigner(this.#accountSignerConfig);
                if (this.#accountSigner) {
                    this.#assertAccountSignerEnvironment(this.#accountSigner);
                }
            }

            // ensure session cookie exists for SSR (handles existing users without session)
            if (this.#accountSigner?.accountAddress) {
                if (!existingSession) {
                    polyesterSession.set({
                        environmentFingerprint: this.#environmentFingerprint,
                        provider: this.#walletProvider ? this.#walletProvider : "other",
                        loginMethod:
                            this.#loginMethod ??
                            (this.#walletProvider === "metamask" ? "metamask" : null),
                        primaryWallet:
                            this.#accountSigner.ownerAddress ?? this.#accountSigner.accountAddress,
                        smartAccount: this.#accountSigner.accountAddress,
                        activeAccount: {
                            accountId: me.accountId,
                            isMain: true,
                            mainAccountId: me.accountId,
                        },
                        username: me.username ?? undefined,
                    });
                } else {
                    this.#walletProvider = existingSession?.provider;
                    this.#loginMethod = existingSession.loginMethod ?? this.#loginMethod;
                }
            }

            this.#notifyStateChange();
            return { accountId: me.accountId, username: me.username };
        } catch {
            this.#clearExpiredSessionState();
            return null;
        }
    }

    async logout(): Promise<void> {
        polyesterToken.clear();
        this.#isAuthenticated = false;
        this.#mainAccountId = null;
        this.#activeAccountId = null;
        this.#loginMethod = null;

        polyesterSession.clear();

        this.#notifyStateChange();
        this.events.emit("loggedOut", undefined);
    }

    #clearExpiredSessionState(): void {
        const shouldEmitLoggedOut = this.#isAuthenticated;
        polyesterToken.clear();
        polyesterSession.clear();
        this.#isAuthenticated = false;
        this.#mainAccountId = null;
        this.#activeAccountId = null;
        this.#loginMethod = null;
        this.#notifyStateChange();
        if (shouldEmitLoggedOut) {
            this.events.emit("loggedOut", undefined);
        }
    }

    getSessionTimeToExpiry(): number {
        const token = getEnvironmentBoundPolyesterToken(this.#environmentFingerprint);
        if (!token) return 0;
        return getJwtTimeToExpiry(token);
    }

    async refreshSession(params?: {
        provider?: "metamask" | "turnkey" | "other";
        loginMethod?: AuthLoginMethod | null;
    }): Promise<LoginResult> {
        if (!this.#isAuthenticated) throw new Error("Must be authenticated to refresh session");

        return this.login({
            provider: this.#resolveRefreshProvider(params?.provider),
            loginMethod: params?.loginMethod ?? this.#loginMethod,
        });
    }

    switchAccount(
        accountId: string,
        options?: { smartAccountAddress?: string; label?: string },
    ): { accountId: string; isMain: boolean } {
        if (!this.#isAuthenticated || !this.#mainAccountId) {
            throw new Error("Must be authenticated to switch accounts");
        }

        this.#activeAccountId = accountId;
        const isMain = accountId === this.#mainAccountId;

        polyesterSession.setActiveAccount({
            accountId,
            isMain,
            smartAccountAddress: options?.smartAccountAddress,
            label: options?.label,
        });
        this.#notifyStateChange();

        return { accountId, isMain };
    }

    /**
     * Create a new subaccount using a derived account signer.
     *
     * The caller is responsible for deriving the subaccount account signer (e.g., via Turnkey
     * with a saltNonce). This method handles the nonce request, message signing, and
     * backend API call.
     */
    async createSubaccount(params: CreateSubaccountParams): Promise<CreateSubaccountResult> {
        if (!this.#isAuthenticated) throw new Error("Must be authenticated to create subaccounts");

        if (!this.#subaccounts) {
            throw new Error(
                "SubaccountsService not configured. Pass it to constructor or call setSubaccountsService().",
            );
        }

        const { accountSigner, label = "", walletProvider = "wallet" } = params;
        this.#assertAccountSignerEnvironment(accountSigner);

        // request nonce for the subaccount's smart account address
        const { nonce } = await this.requestLoginNonce(accountSigner.accountAddress);

        // sign canonical login message with the subaccount account signer
        const message = `Polyester Login\n\nNonce: ${nonce}`;
        const signature = await accountSigner.signMessage(message);

        // use main account signer's owner address for primary wallet reference
        const primaryWalletAddress =
            this.#accountSigner?.ownerAddress ?? this.#accountSigner?.accountAddress ?? "";

        const response = await this.#subaccounts.create({
            label,
            smartAccountAddress: accountSigner.accountAddress,
            nonce,
            signature,
            primaryWalletAddress,
            walletProvider,
        });

        return {
            subaccountId: response.subaccountId,
        };
    }

    getState(): AuthState {
        return {
            isAuthenticated: this.#isAuthenticated,
            accountAddress: this.#accountSigner?.accountAddress ?? null,
            ownerAddress: this.#accountSigner?.ownerAddress ?? null,
            mainAccountId: this.#mainAccountId,
            activeAccount:
                this.#activeAccountId && this.#mainAccountId
                    ? {
                          accountId: this.#activeAccountId,
                          isMain: this.#activeAccountId === this.#mainAccountId,
                          mainAccountId: this.#mainAccountId,
                          smartAccountAddress: this.#accountSigner?.accountAddress,
                      }
                    : null,
        };
    }

    async #resolveAccountSigner(): Promise<AccountSigner | null> {
        if (this.#accountSigner) {
            this.#assertAccountSignerEnvironment(this.#accountSigner);
            return this.#accountSigner;
        }

        const resolved = await resolveAccountSigner(this.#accountSignerConfig);
        if (resolved) {
            this.#assertAccountSignerEnvironment(resolved);
            this.#accountSigner = resolved;
        }
        return this.#accountSigner;
    }

    #notifyStateChange(): void {
        this.events.emit("stateChange", this.getState());
    }

    #resolveRefreshProvider(
        provider?: "metamask" | "turnkey" | "other",
    ): "metamask" | "turnkey" | "other" {
        return (
            provider ?? this.#walletProvider ?? this.#getEnvironmentSession()?.provider ?? "other"
        );
    }

    #assertAccountSignerEnvironment(accountSigner: AccountSigner): void {
        assertAccountSigner(accountSigner);
        if (accountSigner.environmentFingerprint !== this.#environmentFingerprint) {
            throw new Error("Account signer environment does not match client environment.");
        }
    }

    #getEnvironmentSession(): SessionData | null {
        const session = polyesterSession.get();
        if (!session) return null;
        if (session.environmentFingerprint !== this.#environmentFingerprint) {
            polyesterToken.clear();
            polyesterSession.clear();
            return null;
        }
        return session;
    }
}
