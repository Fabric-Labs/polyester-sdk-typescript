import { AuthService, type LoginWithWalletResponse } from "./auth.js";
import { AuthenticationError, ConfigurationError } from "../../shared/errors.js";
import { toPolyesterError } from "../../shared/connect-error-mapping.js";
import { AuthSessionStore } from "./session.js";
import type { AccountSigner, AccountSignerConfig, HexAddress } from "../../account-signer/types.js";
import { assertAccountSigner, resolveAccountSigner } from "../../account-signer/types.js";
import { EventEmitter } from "../../utils/event-emitter.js";
import { isJwtValid, getJwtTimeToExpiry } from "../../utils/jwt.js";
import type { SubaccountChallenge, SubaccountsService } from "../subaccounts/index.js";
import type {
    AuthState,
    AuthHydrationData,
    AuthLoginMethod,
    SessionData,
    ActiveAccountInfo,
} from "./session.types.js";
import type { PolyesterRealtime } from "../../realtime/index.js";
import type { PolyesterEnvironment } from "../../environment.js";
import type { AuthAndPublicApiTransports } from "../../shared/transports.js";
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
    provider: SessionData["provider"];
    /** Browser origin requesting the signature; defaults to location.origin in browsers. Required outside browsers. */
    uri?: string;
    loginMethod?: AuthLoginMethod | null;
}

export interface CreateSubaccountParams {
    /**
     * Signer for the new subaccount, or a factory that derives it from the server challenge
     * (for example via Turnkey with `challenge.smartAccountSaltNonce`). Its accountAddress must
     * equal `challenge.smartAccountAddress`.
     */
    accountSigner:
        | AccountSigner
        | ((challenge: SubaccountChallenge) => AccountSigner | Promise<AccountSigner>);
    /** Optional human-readable label for this subaccount */
    label?: string;
    /** Browser origin requesting the signature; defaults to location.origin in browsers. Required outside browsers. */
    uri?: string;
    /** Root owner EOA bound to the authenticated account; defaults to the configured signer's owner. */
    ownerAddress?: HexAddress;
}

export interface CreateSubaccountResult {
    subaccountId: string;
    smartAccountSaltNonce: number;
    revision: string;
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
    #walletProvider: SessionData["provider"] | undefined = undefined;
    #loginMethod: AuthLoginMethod | null = null;
    #challengeUri: string | undefined = undefined;
    #environmentFingerprint: string;
    #tokenStorage: AuthTokenStorage;
    #sessionStore: AuthSessionStore;
    #realtime: PolyesterRealtime;
    // Every asynchronous auth transition captures this generation. A later login,
    // logout, signer change, or restore makes older work observational only.
    #authOperationGeneration = 0;

    constructor({
        transports,
        accountSignerConfig,
        environment,
        subaccounts,
        realtime,
        tokenStorage,
        sessionStore,
    }: {
        transports: AuthAndPublicApiTransports;
        accountSignerConfig?: AccountSignerConfig;
        environment: PolyesterEnvironment;
        subaccounts: SubaccountsService;
        realtime: PolyesterRealtime;
        tokenStorage: AuthTokenStorage;
        sessionStore?: AuthSessionStore;
    }) {
        super(transports, realtime);

        this.#accountSignerConfig = accountSignerConfig;
        this.#environmentFingerprint = environment.fingerprint;
        this.#subaccounts = subaccounts;
        this.#tokenStorage = tokenStorage;
        this.#realtime = realtime;
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
        this.#beginAuthOperation();
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
     * Signs a server-issued SIWE message with the configured account signer, exchanges it for a session token, and stores the hydrated account/subaccount session state.
     */
    async login(options: LoginOptions): Promise<LoginResult> {
        return this.#login(options);
    }

    async #login(
        options: LoginOptions,
        previousActiveAccount?: ActiveAccountInfo,
    ): Promise<LoginResult> {
        const generation = this.#beginAuthOperation();
        const startingToken = this.#tokenStorage.get();
        const { provider, loginMethod } = options;

        const accountSigner = await this.#resolveAccountSigner();

        if (!accountSigner) {
            throw new ConfigurationError(
                "No account signer configured. Call setAccountSigner() or pass accountSigner in config.",
            );
        }

        const smartAccountAddress = accountSigner.accountAddress;
        const ownerAddress = accountSigner.ownerAddress ?? accountSigner.accountAddress;

        const uri = resolveChallengeUri(options.uri ?? this.#challengeUri);
        const { message } = await this.createWalletChallenge({
            smartAccountAddress,
            signerAddress: ownerAddress,
            uri,
        });
        const signature = await accountSigner.signMessage(message);

        const response = await this.loginWithWallet({
            smartAccountAddress,
            message,
            signature,
            walletProvider: provider,
        });

        if (!this.#isCurrentAuthOperation(generation, startingToken)) {
            throw new DOMException("Authentication operation superseded", "AbortError");
        }
        const environmentSession = this.#getEnvironmentSession();
        const resolvedLoginMethod =
            loginMethod ??
            this.#loginMethod ??
            environmentSession?.loginMethod ??
            (provider === "metamask" || provider === "phantom" ? provider : null);

        const tokenOptions = createAuthTokenStorageSetOptions(response.accessToken);
        const activeAccount =
            previousActiveAccount?.mainAccountId === response.accountId
                ? previousActiveAccount
                : undefined;
        this.#sessionStore.commitLogin(
            {
                accessToken: response.accessToken,
                tokenOptions,
                provider,
                loginMethod: resolvedLoginMethod,
                primaryWallet: ownerAddress,
                smartAccount: smartAccountAddress,
                accountId: response.accountId,
                activeAccount,
                username: response.username ?? undefined,
            },
            this.#tokenStorage,
        );
        this.#isAuthenticated = true;
        this.#mainAccountId = response.accountId;
        this.#activeAccountId = activeAccount?.accountId ?? response.accountId;
        this.#walletProvider = provider;
        this.#loginMethod = resolvedLoginMethod;
        this.#challengeUri = uri;
        this.#accountSigner = accountSigner;
        this.#accountIdentity = this.#identityFromSigner(accountSigner);

        this.#notifyStateChange();

        this.events.emit("authenticated", {
            accountId: response.accountId,
            username: response.username,
        });

        return this.#loginResult(response);
    }

    /**
     * Builds auth state from a session token and optional active account override.
     */
    hydrateAuthState(state: AuthHydrationData): void {
        this.#beginAuthOperation();
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
        const generation = this.#beginAuthOperation();
        const existingToken = this.#getEnvironmentBoundToken();

        if (!existingToken || !isJwtValid(existingToken)) {
            if (this.#isCurrentAuthOperation(generation)) this.#clearExpiredSessionState();
            return null;
        }

        let me: Awaited<ReturnType<AuthService["me"]>>;
        try {
            me = await this.me();
        } catch (error) {
            if (!this.#isCurrentAuthOperation(generation, existingToken)) return null;
            const mappedError = toPolyesterError(error);
            if (mappedError instanceof AuthenticationError) {
                this.#clearExpiredSessionState();
                return null;
            }
            throw mappedError;
        }
        if (!this.#isCurrentAuthOperation(generation, existingToken)) return null;

        let accountSigner = this.#accountSigner;
        if (!accountSigner) {
            try {
                accountSigner = await resolveAccountSigner(this.#accountSignerConfig);
            } catch (error) {
                if (!this.#isCurrentAuthOperation(generation, existingToken)) return null;
                throw error;
            }
            if (!this.#isCurrentAuthOperation(generation, existingToken)) return null;
            if (accountSigner) this.#assertAccountSignerEnvironment(accountSigner);
        }

        if (!isJwtValid(existingToken) || this.#getEnvironmentBoundToken() !== existingToken) {
            this.#clearExpiredSessionState();
            return null;
        }

        const existingSession = this.#getEnvironmentSession();
        const walletProvider = existingSession?.provider ?? this.#walletProvider;
        const loginMethod = existingSession?.loginMethod ?? this.#loginMethod;
        const activeAccountId =
            this.#activeAccountId ?? existingSession?.activeAccount?.accountId ?? me.accountId;

        // Publish runtime state only after asynchronous restoration has completed.
        if (accountSigner) {
            this.#sessionStore.ensureSession(
                {
                    provider: walletProvider ?? "other",
                    loginMethod: loginMethod ?? (walletProvider === "metamask" ? "metamask" : null),
                    primaryWallet: accountSigner.ownerAddress ?? accountSigner.accountAddress,
                    smartAccount: accountSigner.accountAddress,
                    accountId: me.accountId,
                    username: me.username ?? undefined,
                },
                { maxAgeSeconds: this.#getCurrentTokenStorageOptions().maxAgeSeconds },
            );
            this.#accountSigner = accountSigner;
            this.#accountIdentity = this.#identityFromSigner(accountSigner);
        }
        this.#isAuthenticated = true;
        this.#mainAccountId = me.accountId;
        this.#activeAccountId = activeAccountId;
        this.#walletProvider = walletProvider ?? (accountSigner ? "other" : undefined);
        this.#loginMethod = loginMethod;
        this.#notifyStateChange();
        return { accountId: me.accountId, username: me.username };
    }

    /**
     * Clears stored auth state and removes the persisted auth token.
     */
    async logout(): Promise<void> {
        this.#beginAuthOperation();
        this.#realtime.disconnectPrivate();
        this.#tokenStorage.clear();
        this.#isAuthenticated = false;
        this.#mainAccountId = null;
        this.#activeAccountId = null;
        this.#loginMethod = null;
        this.#challengeUri = undefined;
        this.#accountIdentity = null;

        this.#sessionStore.clear();

        this.#notifyStateChange();
        this.events.emit("loggedOut", undefined);
    }

    #clearExpiredSessionState(): void {
        const shouldEmitLoggedOut = this.#isAuthenticated;
        this.#realtime.disconnectPrivate();
        this.#tokenStorage.clear();
        this.#sessionStore.clear();
        this.#isAuthenticated = false;
        this.#mainAccountId = null;
        this.#activeAccountId = null;
        this.#loginMethod = null;
        this.#challengeUri = undefined;
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
        if (!token || !isJwtValid(token)) return 0;
        return getJwtTimeToExpiry(token);
    }

    /**
     * Refreshes the active account-signer session and updates persisted auth state.
     */
    async refreshSession(params?: {
        /** Overrides the origin remembered from login. */
        uri?: string;
        provider?: SessionData["provider"];
        loginMethod?: AuthLoginMethod | null;
    }): Promise<LoginResult> {
        if (!this.#isAuthenticated) {
            throw new AuthenticationError("Must be authenticated to refresh session");
        }

        const currentSession = this.#getEnvironmentSession();
        return this.#login(
            {
                provider: this.#resolveRefreshProvider(params?.provider),
                uri: params?.uri,
                loginMethod: params?.loginMethod ?? this.#loginMethod,
            },
            currentSession?.activeAccount,
        );
    }

    /**
     * Switches the active account/subaccount by signing the required account switch flow.
     */
    switchAccount(
        accountId: string,
        options?: { smartAccountAddress?: string; label?: string },
    ): { accountId: string; isMain: boolean } {
        if (!this.#isAuthenticated || !this.#mainAccountId) {
            throw new AuthenticationError("Must be authenticated to switch accounts");
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

    /** Keeps the display-session identity current for the next server render. */
    syncSessionUsername(username: string | null): void {
        this.#sessionStore.setUsername(username, {
            maxAgeSeconds: this.#getCurrentTokenStorageOptions().maxAgeSeconds,
        });
    }

    /**
     * Creates a subaccount for the authenticated account and makes it available to the session state.
     */
    async createSubaccount(params: CreateSubaccountParams): Promise<CreateSubaccountResult> {
        if (!this.#isAuthenticated) {
            throw new AuthenticationError("Must be authenticated to create subaccounts");
        }

        if (!this.#subaccounts) {
            throw new ConfigurationError(
                "SubaccountsService not configured. Pass it to constructor or call setSubaccountsService().",
            );
        }

        const identity = this.#accountSigner ?? this.#accountIdentity;
        const ownerAddress =
            params.ownerAddress ?? identity?.ownerAddress ?? identity?.accountAddress;
        if (!ownerAddress) {
            throw new ConfigurationError(
                "No root owner address available. Pass ownerAddress or configure an account signer.",
            );
        }

        const { label = "" } = params;
        const challenge = await this.#subaccounts.createChallenge({
            ownerAddress,
            uri: resolveChallengeUri(params.uri ?? this.#challengeUri),
        });
        const accountSigner =
            typeof params.accountSigner === "function"
                ? await params.accountSigner(challenge)
                : params.accountSigner;
        this.#assertAccountSignerEnvironment(accountSigner);
        if (
            accountSigner.accountAddress.toLowerCase() !==
            challenge.smartAccountAddress.toLowerCase()
        ) {
            throw new ConfigurationError(
                `Subaccount signer address ${accountSigner.accountAddress} does not match the server-derived smart account ${challenge.smartAccountAddress}.`,
            );
        }
        const signature = await accountSigner.signMessage(challenge.message);

        const response = await this.#subaccounts.create({
            label,
            smartAccountAddress: challenge.smartAccountAddress,
            message: challenge.message,
            signature,
        });

        return {
            subaccountId: response.subaccountId,
            smartAccountSaltNonce: response.smartAccountSaltNonce,
            revision: response.revision,
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
        }
        return resolved;
    }

    #notifyStateChange(): void {
        this.events.emit("stateChange", this.getState());
    }

    #beginAuthOperation(): number {
        this.#authOperationGeneration += 1;
        return this.#authOperationGeneration;
    }

    #isCurrentAuthOperation(generation: number, token?: string | null): boolean {
        return (
            generation === this.#authOperationGeneration &&
            (token === undefined || this.#tokenStorage.get() === token)
        );
    }

    #loginResult(response: LoginWithWalletResponse): LoginResult {
        const expiresAt = response.expiresAt
            ? new Date(
                  Number(response.expiresAt.seconds) * 1000 +
                      (response.expiresAt.nanos ?? 0) / 1_000_000,
              )
            : new Date();
        return { accountId: response.accountId, username: response.username, expiresAt };
    }

    #getEnvironmentBoundToken(): string | null {
        return this.#sessionStore.getEnvironmentBoundToken(this.#tokenStorage);
    }

    #getCurrentTokenStorageOptions(): AuthTokenStorageSetOptions {
        const token = this.#tokenStorage.get();
        if (!token) return { expiresAt: null, maxAgeSeconds: null };
        return createAuthTokenStorageSetOptions(token);
    }

    #resolveRefreshProvider(provider?: SessionData["provider"]): SessionData["provider"] {
        return (
            provider ?? this.#walletProvider ?? this.#getEnvironmentSession()?.provider ?? "other"
        );
    }

    #assertAccountSignerEnvironment(accountSigner: AccountSigner): void {
        assertAccountSigner(accountSigner);
        if (accountSigner.environmentFingerprint !== this.#environmentFingerprint) {
            throw new ConfigurationError(
                "Account signer environment does not match client environment.",
            );
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

function resolveChallengeUri(uri: string | undefined): string {
    const resolved = uri ?? (typeof location === "undefined" ? undefined : location.origin);
    if (!resolved)
        throw new ConfigurationError(
            "Wallet authentication requires a browser origin URI. Pass uri outside a browser.",
        );
    return resolved;
}
