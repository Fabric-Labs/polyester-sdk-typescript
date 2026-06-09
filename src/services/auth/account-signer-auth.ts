import { AuthService, type AuthServiceTransports } from "./auth.js";
import { AuthSessionStore } from "./session.js";
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
import {
    createAuthTokenStorageSetOptions,
    type AuthTokenStorage,
    type AuthTokenStorageSetOptions,
} from "./token-storage.js";

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

interface AccountIdentity {
    accountAddress: HexAddress;
    ownerAddress?: HexAddress;
}

/**
 * Coordinates wallet/account-signer authentication, session storage, subaccount selection, and session refresh.
 */
export class AccountSignerAuthService extends AuthService {
    readonly events = new EventEmitter<AccountSignerAuthEvents>();

    #accountSignerConfig: AccountSignerConfig | undefined;
    #accountSigner: AccountSigner | null = null;
    #accountIdentity: AccountIdentity | null = null;
    #isAuthenticated = false;
    #mainAccountId: string | null = null;
    #activeAccountId: string | null = null;
    #subaccounts: SubaccountsService;
    #walletProvider: "metamask" | "turnkey" | "other" | undefined = undefined;
    #loginMethod: AuthLoginMethod | null = null;
    #environmentFingerprint: string;
    #tokenStorage: AuthTokenStorage;
    #sessionStore: AuthSessionStore;

    constructor({
        transports,
        accountSignerConfig,
        environment,
        subaccounts,
        realtime,
        tokenStorage,
        sessionStore,
    }: {
        transports: AuthServiceTransports;
        accountSignerConfig?: AccountSignerConfig;
        environment: PolyesterEnvironment;
        subaccounts: SubaccountsService;
        realtime: RealtimeClient;
        tokenStorage: AuthTokenStorage;
        sessionStore?: AuthSessionStore;
    }) {
        super(transports, realtime);

        this.#accountSignerConfig = accountSignerConfig;
        this.#environmentFingerprint = environment.fingerprint;
        this.#subaccounts = subaccounts;
        this.#tokenStorage = tokenStorage;
        this.#sessionStore =
            sessionStore ??
            new AuthSessionStore({
                environmentFingerprint: environment.fingerprint,
            });
    }

    /**
     * Attaches the subaccounts service used when creating a subaccount during authenticated flows.
     */
    setSubaccountsService(subaccounts: SubaccountsService): void {
        this.#subaccounts = subaccounts;
    }

    /**
     * Sets the account signer used to sign login and account-switch challenges.
     */
    setAccountSigner(accountSigner: AccountSigner | null): void {
        if (accountSigner) this.#assertAccountSignerEnvironment(accountSigner);
        this.#accountSigner = accountSigner;
        this.#accountIdentity = accountSigner ? this.#identityFromSigner(accountSigner) : null;
        this.#notifyStateChange();
    }

    /**
     * Returns the active account signer, throwing if one has not been configured.
     */
    getAccountSigner(): AccountSigner | null {
        return this.#accountSigner;
    }

    /**
     * Signs a short-lived login nonce with the configured account signer, exchanges it for a session token, and stores the hydrated account/subaccount session state.
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

        const tokenOptions = createAuthTokenStorageSetOptions(response.accessToken);
        this.#sessionStore.commitLogin(
            {
                accessToken: response.accessToken,
                tokenOptions,
                provider,
                loginMethod: resolvedLoginMethod,
                primaryWallet: ownerAddress,
                smartAccount: smartAccountAddress,
                accountId: response.accountId,
                username: response.username ?? undefined,
            },
            this.#tokenStorage,
        );
        this.#isAuthenticated = true;
        this.#mainAccountId = response.accountId;
        this.#activeAccountId = response.accountId;
        this.#walletProvider = provider;
        this.#loginMethod = resolvedLoginMethod;
        this.#accountIdentity = this.#identityFromSigner(accountSigner);

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
     * Builds auth state from a session token and optional active account override.
     */
    hydrateAuthState(state: AuthHydrationData): void {
        const existingToken = this.#getEnvironmentBoundToken();
        if (!existingToken || !isJwtValid(existingToken)) return;

        const existingSession = this.#getEnvironmentSession();
        this.#walletProvider = existingSession?.provider ?? this.#walletProvider;
        this.#loginMethod = existingSession?.loginMethod ?? this.#loginMethod;

        this.#isAuthenticated = true;
        this.#mainAccountId = state.mainAccountId;
        this.#activeAccountId = state.activeAccountId ?? state.mainAccountId;
        this.#accountIdentity = state.smartAccountAddress
            ? {
                  accountAddress: state.smartAccountAddress,
                  ownerAddress: state.ownerAddress,
              }
            : null;

        this.#notifyStateChange();
    }

    /**
     * Loads the stored token, validates that it still belongs to this environment, and restores auth state when possible.
     */
    async restoreSession(): Promise<{ accountId: string; username: string } | null> {
        const existingToken = this.#getEnvironmentBoundToken();

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
                    this.#accountIdentity = this.#identityFromSigner(this.#accountSigner);
                }
            }

            // keep the display session available for SSR hydration
            if (this.#accountSigner?.accountAddress) {
                const session = this.#sessionStore.ensureSession(
                    {
                        provider: this.#walletProvider ? this.#walletProvider : "other",
                        loginMethod:
                            this.#loginMethod ??
                            (this.#walletProvider === "metamask" ? "metamask" : null),
                        primaryWallet:
                            this.#accountSigner.ownerAddress ?? this.#accountSigner.accountAddress,
                        smartAccount: this.#accountSigner.accountAddress,
                        accountId: me.accountId,
                        username: me.username ?? undefined,
                    },
                    { maxAgeSeconds: this.#getCurrentTokenStorageOptions().maxAgeSeconds },
                );
                this.#walletProvider = session.provider;
                this.#loginMethod = session.loginMethod ?? this.#loginMethod;
            }

            this.#notifyStateChange();
            return { accountId: me.accountId, username: me.username };
        } catch {
            this.#clearExpiredSessionState();
            return null;
        }
    }

    /**
     * Clears stored auth state and removes the persisted auth token.
     */
    async logout(): Promise<void> {
        this.#tokenStorage.clear();
        this.#isAuthenticated = false;
        this.#mainAccountId = null;
        this.#activeAccountId = null;
        this.#loginMethod = null;
        this.#accountIdentity = null;

        this.#sessionStore.clear();

        this.#notifyStateChange();
        this.events.emit("loggedOut", undefined);
    }

    #clearExpiredSessionState(): void {
        const shouldEmitLoggedOut = this.#isAuthenticated;
        this.#tokenStorage.clear();
        this.#sessionStore.clear();
        this.#isAuthenticated = false;
        this.#mainAccountId = null;
        this.#activeAccountId = null;
        this.#loginMethod = null;
        this.#accountIdentity = null;
        this.#notifyStateChange();
        if (shouldEmitLoggedOut) {
            this.events.emit("loggedOut", undefined);
        }
    }

    /**
     * Returns the remaining lifetime of the stored session token in milliseconds.
     */
    getSessionTimeToExpiry(): number {
        const token = this.#getEnvironmentBoundToken();
        if (!token) return 0;
        return getJwtTimeToExpiry(token);
    }

    /**
     * Refreshes the active account-signer session and updates persisted auth state.
     */
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

    /**
     * Switches the active account/subaccount by signing the required account switch flow.
     */
    switchAccount(
        accountId: string,
        options?: { smartAccountAddress?: string; label?: string },
    ): { accountId: string; isMain: boolean } {
        if (!this.#isAuthenticated || !this.#mainAccountId) {
            throw new Error("Must be authenticated to switch accounts");
        }

        this.#activeAccountId = accountId;
        const isMain = accountId === this.#mainAccountId;

        this.#sessionStore.setActiveAccount(
            {
                accountId,
                isMain,
                smartAccountAddress: options?.smartAccountAddress,
                label: options?.label,
            },
            { maxAgeSeconds: this.#getCurrentTokenStorageOptions().maxAgeSeconds },
        );
        this.#notifyStateChange();

        return { accountId, isMain };
    }

    /**
     * Creates a subaccount for the authenticated account and makes it available to the session state.
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

    /**
     * Returns the current account-signer auth state snapshot.
     */
    getState(): AuthState {
        const accountIdentity = this.#accountSigner ?? this.#accountIdentity;

        return {
            isAuthenticated: this.#isAuthenticated,
            accountAddress: accountIdentity?.accountAddress ?? null,
            ownerAddress: accountIdentity?.ownerAddress ?? null,
            mainAccountId: this.#mainAccountId,
            activeAccount:
                this.#activeAccountId && this.#mainAccountId
                    ? {
                          accountId: this.#activeAccountId,
                          isMain: this.#activeAccountId === this.#mainAccountId,
                          mainAccountId: this.#mainAccountId,
                          smartAccountAddress: accountIdentity?.accountAddress,
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
            this.#accountIdentity = this.#identityFromSigner(resolved);
        }
        return this.#accountSigner;
    }

    #notifyStateChange(): void {
        this.events.emit("stateChange", this.getState());
    }

    #getEnvironmentBoundToken(): string | null {
        return this.#sessionStore.getEnvironmentBoundToken(this.#tokenStorage);
    }

    #getCurrentTokenStorageOptions(): AuthTokenStorageSetOptions {
        const token = this.#tokenStorage.get();
        if (!token) return { expiresAt: null, maxAgeSeconds: null };
        return createAuthTokenStorageSetOptions(token);
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

    #identityFromSigner(accountSigner: AccountSigner): AccountIdentity {
        return {
            accountAddress: accountSigner.accountAddress,
            ownerAddress: accountSigner.ownerAddress,
        };
    }

    #getEnvironmentSession(): SessionData | null {
        return this.#sessionStore.get();
    }
}
