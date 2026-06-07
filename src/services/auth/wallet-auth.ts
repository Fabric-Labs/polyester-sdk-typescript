import { AuthService, type AuthServiceTransports } from "./auth.js";
import { polyesterToken } from "../../shared/polyester-token.js";
import { polyesterSession } from "../../shared/polyester-session.js";
import { POLYESTER_LOGIN_COOKIE_MAX_AGE } from "../../shared/constants.js";
import type { PolyesterWallet, WalletConfig, HexAddress } from "../../wallet/types.js";
import { resolveWallet } from "../../wallet/types.js";
import { EventEmitter } from "../../utils/event-emitter.js";
import { isJwtValid, getJwtTimeToExpiry } from "../../utils/jwt.js";
import type { SubaccountsService } from "../subaccounts/index.js";
import { formatId } from "../../utils/base58-id.js";
import type { AuthState, AuthHydrationData, AuthLoginMethod } from "../../shared/auth-types.js";
import type { RealtimeClient } from "../../realtime/index.js";

export interface WalletAuthEvents {
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
    /** The wallet for the new subaccount (caller derives this, e.g. via Turnkey saltNonce) */
    wallet: PolyesterWallet;
    /** Optional human-readable label for this subaccount */
    label?: string;
    /** Wallet provider hint (e.g. "turnkey", "metamask"). Defaults to "wallet" */
    walletProvider?: string;
}

export interface CreateSubaccountResult {
    subaccountId: string;
}

export class WalletAuthService extends AuthService {
    readonly events = new EventEmitter<WalletAuthEvents>();

    #walletConfig: WalletConfig | undefined;
    #wallet: PolyesterWallet | null = null;
    #isAuthenticated = false;
    #mainAccountId: string | null = null;
    #activeAccountId: string | null = null;
    #subaccounts: SubaccountsService;
    #walletProvider: "metamask" | "turnkey" | "other" | undefined = undefined;
    #loginMethod: AuthLoginMethod | null = null;

    constructor({
        transports,
        walletConfig,
        subaccounts,
        realtime,
    }: {
        transports: AuthServiceTransports;
        walletConfig?: WalletConfig;
        subaccounts: SubaccountsService;
        realtime: RealtimeClient;
    }) {
        super(transports, realtime);

        this.#walletConfig = walletConfig;
        this.#subaccounts = subaccounts;
    }

    /**
     * Set or update the subaccounts service. Useful for lazy initialization.
     */
    setSubaccountsService(subaccounts: SubaccountsService): void {
        this.#subaccounts = subaccounts;
    }

    /**
     * Set or update the wallet. Useful for lazy wallet initialization.
     */
    setWallet(wallet: PolyesterWallet | null): void {
        this.#wallet = wallet;
        this.#notifyStateChange();
    }

    /**
     * Get the current wallet if available.
     */
    getWallet(): PolyesterWallet | null {
        return this.#wallet;
    }

    /**
     * Login with the configured wallet.
     * Requests a nonce, signs it with the wallet, and authenticates with Polyester backend.
     */
    async login(options: LoginOptions): Promise<LoginResult> {
        const { provider, loginMethod } = options;

        const wallet = await this.#resolveWallet();

        if (!wallet) {
            throw new Error("No wallet configured. Call setWallet() or pass wallet in config.");
        }

        const smartAccountAddress = wallet.address;
        const ownerAddress = wallet.ownerAddress ?? wallet.address;

        const { nonce } = await this.requestLoginNonce(smartAccountAddress);

        const message = `Polyester Login\n\nNonce: ${nonce}`;
        const signature = await wallet.signMessage(message);

        const response = await this.loginWithWallet({
            smartAccountAddress,
            nonce,
            signature,
            primaryWalletAddress: ownerAddress,
            walletProvider: provider,
        });

        const existingSession = polyesterSession.get();
        const resolvedLoginMethod =
            loginMethod ??
            this.#loginMethod ??
            existingSession?.loginMethod ??
            (provider === "metamask" ? "metamask" : null);

        polyesterToken.set(response.accessToken, { maxAge: POLYESTER_LOGIN_COOKIE_MAX_AGE });
        this.#isAuthenticated = true;
        this.#mainAccountId = response.accountId;
        this.#activeAccountId = response.accountId;
        this.#walletProvider = provider;
        this.#loginMethod = resolvedLoginMethod;

        // set full session for SSR hydration
        polyesterSession.set({
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
            const existingToken = polyesterToken.get();
            if (!existingToken || !isJwtValid(existingToken)) return;
        }

        const existingSession = polyesterSession.get();
        this.#walletProvider = existingSession?.provider ?? this.#walletProvider;
        this.#loginMethod = existingSession?.loginMethod ?? this.#loginMethod;

        this.#isAuthenticated = true;
        this.#mainAccountId = state.mainAccountId;
        this.#activeAccountId = state.activeAccountId ?? state.mainAccountId;

        if (state.smartAccountAddress || state.ownerAddress) {
            this.#wallet = {
                address: state.smartAccountAddress as HexAddress,
                ownerAddress: state.ownerAddress as HexAddress,
                signMessage: async () => {
                    throw new Error(
                        "Hydrated wallet cannot sign. Call setWallet() with a real wallet.",
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
        const existingToken = polyesterToken.get();

        if (!existingToken || !isJwtValid(existingToken)) {
            this.#clearExpiredSessionState();
            return null;
        }

        try {
            const me = await this.me();
            this.#isAuthenticated = true;
            this.#mainAccountId = me.accountId;

            // preserve active account if already set (e.g. via hydration), otherwise use main
            const existingSession = polyesterSession.get();
            this.#walletProvider = existingSession?.provider ?? this.#walletProvider;
            this.#loginMethod = existingSession?.loginMethod ?? this.#loginMethod;
            if (!this.#activeAccountId) {
                this.#activeAccountId = existingSession?.activeAccount?.accountId ?? me.accountId;
            }

            // use existing wallet if set, otherwise try to resolve from config
            if (!this.#wallet) {
                this.#wallet = await resolveWallet(this.#walletConfig);
            }

            // ensure session cookie exists for SSR (handles existing users without session)
            if (this.#wallet?.address) {
                if (!existingSession) {
                    polyesterSession.set({
                        provider: this.#walletProvider ? this.#walletProvider : "other",
                        loginMethod:
                            this.#loginMethod ??
                            (this.#walletProvider === "metamask" ? "metamask" : null),
                        primaryWallet: this.#wallet.ownerAddress ?? this.#wallet.address,
                        smartAccount: this.#wallet.address,
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
        const token = polyesterToken.get();
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
     * Create a new subaccount using a derived wallet.
     *
     * The caller is responsible for deriving the subaccount wallet (e.g., via Turnkey
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

        const { wallet, label = "", walletProvider = "wallet" } = params;

        // request nonce for the subaccount's smart account address
        const { nonce } = await this.requestLoginNonce(wallet.address);

        // sign canonical login message with the subaccount wallet
        const message = `Polyester Login\n\nNonce: ${nonce}`;
        const signature = await wallet.signMessage(message);

        // use main wallet's owner address for primary wallet reference
        const primaryWalletAddress = this.#wallet?.ownerAddress ?? this.#wallet?.address ?? "";

        const response = await this.#subaccounts.create({
            label,
            smartAccountAddress: wallet.address,
            nonce,
            signature,
            primaryWalletAddress,
            walletProvider,
        });

        return {
            subaccountId: formatId(response.subaccountId),
        };
    }

    getState(): AuthState {
        return {
            isAuthenticated: this.#isAuthenticated,
            address: this.#wallet?.address ?? null,
            ownerAddress: this.#wallet?.ownerAddress ?? null,
            mainAccountId: this.#mainAccountId,
            activeAccount:
                this.#activeAccountId && this.#mainAccountId
                    ? {
                          accountId: this.#activeAccountId,
                          isMain: this.#activeAccountId === this.#mainAccountId,
                          mainAccountId: this.#mainAccountId,
                          smartAccountAddress: this.#wallet?.address,
                      }
                    : null,
        };
    }

    async #resolveWallet(): Promise<PolyesterWallet | null> {
        if (this.#wallet) return this.#wallet;

        const resolved = await resolveWallet(this.#walletConfig);
        if (resolved) {
            this.#wallet = resolved;
        }
        return this.#wallet;
    }

    #notifyStateChange(): void {
        this.events.emit("stateChange", this.getState());
    }

    #resolveRefreshProvider(
        provider?: "metamask" | "turnkey" | "other",
    ): "metamask" | "turnkey" | "other" {
        return provider ?? this.#walletProvider ?? polyesterSession.get()?.provider ?? "other";
    }
}
