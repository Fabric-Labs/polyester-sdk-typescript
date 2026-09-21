import { Code, ConnectError, type Transport } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountSigner, AccountSignerConfig } from "../../account-signer/index.js";
import { POLYESTER_DEVNET_ENVIRONMENT } from "../../environment.js";
import { RealtimeClient } from "../../realtime/index.js";
import { formatId } from "../../utils/base58-id.js";
import { SubaccountsService } from "../subaccounts/index.js";
import { AccountSignerAuthService } from "./account-signer-auth.js";
import {
    AuthenticationError,
    ConfigurationError,
    ServiceUnavailableError,
} from "../../shared/errors.js";
import type { LoginWithWalletInput, LoginWithWalletResponse } from "./auth.js";
import { polyesterSession } from "./session.js";
import { createMemoryAuthTokenStorage, type AuthTokenStorage } from "./token-storage.js";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

function base64UrlEncode(value: string): string {
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function jwtWithExp(exp: number): string {
    return ["header", base64UrlEncode(JSON.stringify({ exp })), "signature"].join(".");
}

function installDocument(cookie = ""): void {
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { cookie },
        writable: true,
    });
}

function noopTransport(): Transport {
    return {
        unary: vi.fn(),
        stream: vi.fn(),
    } as unknown as Transport;
}

function createTestStorage(initialToken: string | null = null) {
    let token = initialToken;
    return {
        get: vi.fn(() => token),
        set: vi.fn((nextToken: string) => {
            token = nextToken;
        }),
        clear: vi.fn(() => {
            token = null;
        }),
    } satisfies AuthTokenStorage;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function authFixture(accountSigner?: AccountSignerConfig, tokenStorage?: AuthTokenStorage) {
    const publicApi = noopTransport();
    const authApi = noopTransport();
    const realtime = new RealtimeClient({
        wsUrl: POLYESTER_DEVNET_ENVIRONMENT.websocketUrl,
        tokenEndpoint: `${POLYESTER_DEVNET_ENVIRONMENT.apiUrl}/v1/rt/token`,
        subscribeEndpoint: `${POLYESTER_DEVNET_ENVIRONMENT.apiUrl}/v1/rt/subscribe`,
        hasAuth: () => false,
    });
    const subaccounts = new SubaccountsService({ publicApi, authApi }, realtime);

    const auth = new AccountSignerAuthService({
        transports: { publicApi, authApi },
        accountSignerConfig: accountSigner,
        environment: POLYESTER_DEVNET_ENVIRONMENT,
        subaccounts,
        realtime,
        tokenStorage: tokenStorage ?? createMemoryAuthTokenStorage(),
    });

    return { auth, realtime, subaccounts };
}

function authService(accountSigner?: AccountSigner) {
    return authFixture(accountSigner).auth;
}

function signer(params: Partial<AccountSigner> = {}): AccountSigner {
    const signMessage = vi.fn(async (_message: string): Promise<`0x${string}`> => "0x1234");

    return {
        environmentFingerprint: POLYESTER_DEVNET_ENVIRONMENT.fingerprint,
        accountAddress: "0x1111111111111111111111111111111111111111",
        ownerAddress: "0x2222222222222222222222222222222222222222",
        signMessage,
        ...params,
    };
}

function mockSubaccountChallenge(subaccounts: SubaccountsService, smartAccountAddress: string) {
    return vi.spyOn(subaccounts, "createChallenge").mockResolvedValue({
        message: "subaccount server message",
        smartAccountAddress,
        smartAccountSaltNonce: 1,
        expiresAt: 1_000,
        polyesterChainId: 1,
    });
}

function mockLogin(auth: AccountSignerAuthService) {
    const createWalletChallenge = vi
        .spyOn(auth, "createWalletChallenge")
        .mockResolvedValue({ message: "server-issued message ☃\nexact bytes" });
    const loginWithWallet = vi
        .spyOn(
            auth as unknown as {
                loginWithWallet(input: LoginWithWalletInput): Promise<LoginWithWalletResponse>;
            },
            "loginWithWallet",
        )
        .mockResolvedValue({
            accessToken: "token-1",
            accountId: "account-1",
            username: "hunter",
            expiresAt: {
                seconds: 1n,
                nanos: 0,
            },
        });

    return { createWalletChallenge, loginWithWallet };
}

describe("AccountSignerAuthService", () => {
    afterEach(() => {
        polyesterSession.clear();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
        if (originalDocument) {
            Object.defineProperty(globalThis, "document", originalDocument);
        } else {
            Reflect.deleteProperty(globalThis, "document");
        }
    });

    it("uses the current browser origin for login, refresh, and subaccount challenges", async () => {
        vi.stubGlobal("location", { origin: "https://browser.example:8443" });
        const accountSigner = signer();
        const { auth, subaccounts } = authFixture(accountSigner);
        const { createWalletChallenge } = mockLogin(auth);
        const createChallenge = mockSubaccountChallenge(subaccounts, accountSigner.accountAddress);
        vi.spyOn(subaccounts, "create").mockResolvedValue({
            subaccountId: "sub",
            totalCreated: 1,
            smartAccountSaltNonce: 1,
            revision: "1",
        });
        await auth.login({ provider: "other" });
        await auth.refreshSession();
        await auth.createSubaccount({ accountSigner });
        expect(createWalletChallenge).toHaveBeenCalledTimes(2);
        expect(createChallenge).toHaveBeenCalledTimes(1);
        for (const [input] of [
            ...createWalletChallenge.mock.calls,
            ...createChallenge.mock.calls,
        ]) {
            expect(input.uri).toBe("https://browser.example:8443");
        }
    });

    it("requires an explicit origin outside a browser before requesting or signing a challenge", async () => {
        vi.stubGlobal("location", undefined);
        const accountSigner = signer();
        const auth = authService(accountSigner);
        const { createWalletChallenge } = mockLogin(auth);
        await expect(auth.login({ provider: "other" })).rejects.toThrow(
            "Pass uri outside a browser",
        );
        expect(createWalletChallenge).not.toHaveBeenCalled();
        expect(accountSigner.signMessage).not.toHaveBeenCalled();
    });

    it("reuses the login origin for refresh and subaccount challenges outside a browser", async () => {
        vi.stubGlobal("location", undefined);
        const accountSigner = signer();
        const auth = authService(accountSigner);
        const { createWalletChallenge } = mockLogin(auth);
        await auth.login({ uri: "https://app.example", provider: "other" });
        await auth.refreshSession();
        expect(createWalletChallenge).toHaveBeenLastCalledWith(
            expect.objectContaining({ uri: "https://app.example" }),
        );
        await auth.refreshSession({ uri: "https://other.example" });
        expect(createWalletChallenge).toHaveBeenLastCalledWith(
            expect.objectContaining({ uri: "https://other.example" }),
        );
        await auth.logout();
        await expect(auth.login({ provider: "other" })).rejects.toThrow(
            "Pass uri outside a browser",
        );
    });

    it("does not sign or commit a session after challenge failure and can retry", async () => {
        const accountSigner = signer();
        const tokenStorage = createTestStorage();
        const auth = authFixture(accountSigner, tokenStorage).auth;
        const { createWalletChallenge, loginWithWallet } = mockLogin(auth);
        const failure = new Error("challenge unavailable");
        createWalletChallenge.mockRejectedValueOnce(failure);
        await expect(auth.login({ uri: "https://app.example", provider: "other" })).rejects.toBe(
            failure,
        );
        expect(accountSigner.signMessage).not.toHaveBeenCalled();
        expect(loginWithWallet).not.toHaveBeenCalled();
        expect(tokenStorage.set).not.toHaveBeenCalled();
        await auth.login({ uri: "https://app.example", provider: "other" });
        expect(accountSigner.signMessage).toHaveBeenCalledOnce();
        expect(tokenStorage.set).toHaveBeenCalledOnce();
    });

    it("maps account signer fields to the backend wallet login payload", async () => {
        const accountSigner = signer();
        const auth = authService(accountSigner);
        const { createWalletChallenge, loginWithWallet } = mockLogin(auth);

        await auth.login({ uri: "https://app.example", provider: "turnkey" });

        expect(createWalletChallenge).toHaveBeenCalledWith({
            smartAccountAddress: accountSigner.accountAddress,
            signerAddress: accountSigner.ownerAddress,
            uri: "https://app.example",
        });
        expect(accountSigner.signMessage).toHaveBeenCalledWith(
            "server-issued message ☃\nexact bytes",
        );
        expect(loginWithWallet).toHaveBeenCalledWith({
            smartAccountAddress: accountSigner.accountAddress,
            message: "server-issued message ☃\nexact bytes",
            signature: "0x1234",
            walletProvider: "turnkey",
        });
        expect(auth.getState()).toMatchObject({
            isAuthenticated: true,
            accountAddress: accountSigner.accountAddress,
            ownerAddress: accountSigner.ownerAddress,
        });
    });

    it("declares the distinct EOA as the LOGIN signer and keeps the Safe as the smart account on login and refresh", async () => {
        const accountSigner = signer({
            accountAddress: "0x3333333333333333333333333333333333333333",
            ownerAddress: "0x4444444444444444444444444444444444444444",
        });
        const auth = authService(accountSigner);
        const { createWalletChallenge, loginWithWallet } = mockLogin(auth);

        await auth.login({ uri: "https://app.example", provider: "metamask" });
        await auth.refreshSession();

        expect(createWalletChallenge).toHaveBeenCalledTimes(2);
        for (const [input] of createWalletChallenge.mock.calls) {
            expect(input).toEqual({
                smartAccountAddress: "0x3333333333333333333333333333333333333333",
                signerAddress: "0x4444444444444444444444444444444444444444",
                uri: "https://app.example",
            });
        }
        expect(accountSigner.signMessage).toHaveBeenCalledTimes(2);
        expect(accountSigner.signMessage).toHaveBeenCalledWith(
            "server-issued message ☃\nexact bytes",
        );
        for (const [input] of loginWithWallet.mock.calls) {
            expect(input).toMatchObject({
                smartAccountAddress: "0x3333333333333333333333333333333333333333",
                message: "server-issued message ☃\nexact bytes",
                signature: "0x1234",
            });
        }
    });

    it("signs the LOGIN challenge with accountAddress when ownerAddress is absent", async () => {
        const accountSigner = signer({ ownerAddress: undefined });
        const auth = authService(accountSigner);
        const { createWalletChallenge, loginWithWallet } = mockLogin(auth);

        await auth.login({ uri: "https://app.example", provider: "other" });

        expect(createWalletChallenge).toHaveBeenCalledWith({
            smartAccountAddress: accountSigner.accountAddress,
            signerAddress: accountSigner.accountAddress,
            uri: "https://app.example",
        });
        expect(loginWithWallet.mock.calls[0]?.[0]).toMatchObject({
            smartAccountAddress: accountSigner.accountAddress,
        });
    });

    it("uses the replacement signer after setAccountSigner", async () => {
        const initialSigner = signer({
            accountAddress: "0x1111111111111111111111111111111111111111",
        });
        const replacementSigner = signer({
            accountAddress: "0x5555555555555555555555555555555555555555",
        });
        const auth = authService(initialSigner);
        const { createWalletChallenge } = mockLogin(auth);

        auth.setAccountSigner(replacementSigner);
        await auth.login({ uri: "https://app.example", provider: "other" });

        expect(createWalletChallenge).toHaveBeenCalledWith({
            smartAccountAddress: replacementSigner.accountAddress,
            signerAddress: replacementSigner.ownerAddress,
            uri: "https://app.example",
        });
    });

    it("stores login tokens through the configured token storage", async () => {
        const accountSigner = signer();
        const tokenStorage = createTestStorage();
        const auth = authFixture(accountSigner, tokenStorage).auth;
        mockLogin(auth);

        await auth.login({ uri: "https://app.example", provider: "turnkey" });

        expect(tokenStorage.set).toHaveBeenCalledWith("token-1", {
            expiresAt: null,
            maxAgeSeconds: null,
        });
    });

    it("replaces the configured token storage token on refresh", async () => {
        const accountSigner = signer();
        const tokenStorage = createTestStorage();
        const auth = authFixture(accountSigner, tokenStorage).auth;
        const { loginWithWallet } = mockLogin(auth);

        await auth.login({ uri: "https://app.example", provider: "turnkey" });
        loginWithWallet.mockResolvedValueOnce({
            accessToken: "token-2",
            accountId: "account-1",
            username: "hunter",
            expiresAt: {
                seconds: 1n,
                nanos: 0,
            },
        });
        await auth.refreshSession({ uri: "https://app.example" });

        expect(tokenStorage.set).toHaveBeenNthCalledWith(1, "token-1", {
            expiresAt: null,
            maxAgeSeconds: null,
        });
        expect(tokenStorage.set).toHaveBeenNthCalledWith(2, "token-2", {
            expiresAt: null,
            maxAgeSeconds: null,
        });
    });

    it("preserves the active subaccount in runtime and display-session state on refresh", async () => {
        const accountSigner = signer();
        const auth = authService(accountSigner);
        const { loginWithWallet } = mockLogin(auth);
        installDocument();

        await auth.login({ uri: "https://app.example", provider: "turnkey" });
        auth.switchAccount("sub-1", {
            label: "Operations",
            smartAccountAddress: "0x3333333333333333333333333333333333333333",
        });
        loginWithWallet.mockResolvedValueOnce({
            accessToken: "token-2",
            accountId: "account-1",
            username: "hunter",
            expiresAt: { seconds: 2n, nanos: 0 },
        });

        await auth.refreshSession({ uri: "https://app.example" });

        expect(auth.getState().activeAccount).toMatchObject({
            accountId: "sub-1",
            isMain: false,
            mainAccountId: "account-1",
        });
        expect(polyesterSession.get()?.activeAccount).toEqual({
            accountId: "sub-1",
            isMain: false,
            mainAccountId: "account-1",
            label: "Operations",
            smartAccountAddress: "0x3333333333333333333333333333333333333333",
        });
    });

    it("resets the active account when refresh resolves a different main account", async () => {
        const auth = authService(signer());
        const { loginWithWallet } = mockLogin(auth);
        installDocument();

        await auth.login({ uri: "https://app.example", provider: "turnkey" });
        auth.switchAccount("sub-1", { label: "Operations" });
        loginWithWallet.mockResolvedValueOnce({
            accessToken: "token-2",
            accountId: "account-2",
            username: "hunter",
            expiresAt: { seconds: 2n, nanos: 0 },
        });

        await auth.refreshSession({ uri: "https://app.example" });

        expect(auth.getState().activeAccount).toMatchObject({
            accountId: "account-2",
            isMain: true,
            mainAccountId: "account-2",
        });
        expect(polyesterSession.get()?.activeAccount).toMatchObject({
            accountId: "account-2",
            isMain: true,
            mainAccountId: "account-2",
        });
    });

    it("clears the configured token storage on logout", async () => {
        const accountSigner = signer();
        const tokenStorage = createTestStorage();
        const { auth, realtime } = authFixture(accountSigner, tokenStorage);
        const disconnectPrivate = vi.spyOn(realtime, "disconnectPrivate");
        mockLogin(auth);

        await auth.login({ uri: "https://app.example", provider: "turnkey" });
        await auth.logout();

        expect(tokenStorage.clear).toHaveBeenCalledTimes(1);
        expect(disconnectPrivate).toHaveBeenCalledTimes(1);
    });

    it("resolves logout and notifies every listener when one listener throws", async () => {
        const tokenStorage = createTestStorage();
        const auth = authFixture(signer(), tokenStorage).auth;
        const laterListener = vi.fn();
        mockLogin(auth);
        await auth.login({ uri: "https://app.example", provider: "turnkey" });

        auth.events.on("loggedOut", () => {
            throw new Error("listener failed");
        });
        auth.events.on("loggedOut", laterListener);

        await expect(auth.logout()).resolves.toBeUndefined();
        expect(tokenStorage.get()).toBeNull();
        expect(auth.getState().isAuthenticated).toBe(false);
        expect(laterListener).toHaveBeenCalledOnce();
    });

    it("restores a valid stored token through the configured token storage", async () => {
        const accountSigner = signer();
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
        const tokenStorage = createTestStorage(token);
        const auth = authFixture(accountSigner, tokenStorage).auth;
        installDocument();
        polyesterSession.set({
            environmentFingerprint: POLYESTER_DEVNET_ENVIRONMENT.fingerprint,
            provider: "turnkey",
            loginMethod: null,
            primaryWallet: accountSigner.ownerAddress ?? accountSigner.accountAddress,
            smartAccount: accountSigner.accountAddress,
            activeAccount: {
                accountId: "account-1",
                isMain: true,
                mainAccountId: "account-1",
            },
            username: "stale-name",
        });
        vi.spyOn(auth, "me").mockResolvedValue({ accountId: "account-1", username: "hunter" });

        await expect(auth.restoreSession()).resolves.toEqual({
            accountId: "account-1",
            username: "hunter",
        });

        expect(tokenStorage.clear).not.toHaveBeenCalled();
        expect(polyesterSession.get()?.username).toBe("hunter");
        expect(auth.getState()).toMatchObject({
            isAuthenticated: true,
            mainAccountId: "account-1",
        });
    });

    it("keeps a valid session after a transient restore failure", async () => {
        const accountSigner = signer();
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
        const tokenStorage = createTestStorage(token);
        const { auth, realtime } = authFixture(accountSigner, tokenStorage);
        const disconnectPrivate = vi.spyOn(realtime, "disconnectPrivate");
        installDocument();
        polyesterSession.set({
            environmentFingerprint: POLYESTER_DEVNET_ENVIRONMENT.fingerprint,
            provider: "turnkey",
            loginMethod: null,
            primaryWallet: accountSigner.ownerAddress ?? accountSigner.accountAddress,
            smartAccount: accountSigner.accountAddress,
        });
        auth.hydrateAuthState({ mainAccountId: "account-1", username: "user" });
        const stateChange = vi.fn();
        const loggedOut = vi.fn();
        auth.events.on("stateChange", stateChange);
        auth.events.on("loggedOut", loggedOut);
        vi.spyOn(auth, "me").mockRejectedValue(
            new ServiceUnavailableError("temporarily unavailable"),
        );

        await expect(auth.restoreSession()).rejects.toBeInstanceOf(ServiceUnavailableError);

        expect(tokenStorage.get()).toBe(token);
        expect(tokenStorage.clear).not.toHaveBeenCalled();
        expect(disconnectPrivate).not.toHaveBeenCalled();
        expect(polyesterSession.get()).not.toBeNull();
        expect(auth.getState().isAuthenticated).toBe(true);
        expect(stateChange).not.toHaveBeenCalled();
        expect(loggedOut).not.toHaveBeenCalled();
    });

    it("does not let a stale restore rejection clear a newer login", async () => {
        const accountSigner = signer();
        const previousToken = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
        const freshToken = jwtWithExp(Math.floor(Date.now() / 1000) + 7200);
        const tokenStorage = createTestStorage(previousToken);
        const { auth } = authFixture(accountSigner, tokenStorage);
        installDocument();
        polyesterSession.set({
            environmentFingerprint: POLYESTER_DEVNET_ENVIRONMENT.fingerprint,
            provider: "turnkey",
            loginMethod: null,
            primaryWallet: accountSigner.ownerAddress ?? accountSigner.accountAddress,
            smartAccount: accountSigner.accountAddress,
        });
        const restore = deferred<{ accountId: string; username: string }>();
        vi.spyOn(auth, "me").mockReturnValue(restore.promise);
        const { loginWithWallet } = mockLogin(auth);
        loginWithWallet.mockResolvedValue({
            accessToken: freshToken,
            accountId: "fresh-account",
            username: "fresh-user",
        });

        const restoring = auth.restoreSession();
        await auth.login({ uri: "https://app.example", provider: "turnkey" });
        restore.reject(new AuthenticationError("session rejected"));

        await expect(restoring).resolves.toBeNull();
        expect(tokenStorage.get()).toBe(freshToken);
        expect(auth.getState()).toMatchObject({
            isAuthenticated: true,
            mainAccountId: "fresh-account",
        });
        expect(polyesterSession.get()?.username).toBe("fresh-user");
    });

    it("does not let an older login replace a newer login", async () => {
        installDocument();
        const accountSigner = signer();
        const { auth } = authFixture(accountSigner);
        const firstResponse = deferred<LoginWithWalletResponse>();
        const freshToken = jwtWithExp(Math.floor(Date.now() / 1000) + 7200);
        const { loginWithWallet } = mockLogin(auth);
        loginWithWallet
            .mockImplementationOnce(() => firstResponse.promise)
            .mockResolvedValueOnce({
                accessToken: freshToken,
                accountId: "fresh-account",
                username: "fresh-user",
            });

        const firstLogin = auth.login({ uri: "https://app.example", provider: "turnkey" });
        await Promise.resolve();
        const secondLogin = auth.login({ uri: "https://app.example", provider: "turnkey" });
        await secondLogin;
        firstResponse.resolve({
            accessToken: jwtWithExp(Math.floor(Date.now() / 1000) + 3600),
            accountId: "old-account",
            username: "old-user",
        });

        await expect(firstLogin).rejects.toMatchObject({ name: "AbortError" });
        expect(auth.getState()).toMatchObject({
            isAuthenticated: true,
            mainAccountId: "fresh-account",
        });
        expect(polyesterSession.get()?.username).toBe("fresh-user");
    });

    it.each(["success", "rejection"])(
        "ignores stale restore %s after token replacement",
        async (outcome) => {
            installDocument();
            const previous = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
            const fresh = jwtWithExp(Math.floor(Date.now() / 1000) + 7200);
            const storage = createTestStorage(previous);
            const { auth } = authFixture(signer(), storage);
            const pending = deferred<{ accountId: string; username: string }>();
            vi.spyOn(auth, "me").mockReturnValue(pending.promise);
            const stateChange = vi.fn();
            const loggedOut = vi.fn();
            auth.events.on("stateChange", stateChange);
            auth.events.on("loggedOut", loggedOut);
            const restoring = auth.restoreSession();
            storage.set(fresh);
            if (outcome === "success") pending.resolve({ accountId: "old", username: "old" });
            else pending.reject(new AuthenticationError("rejected"));
            await expect(restoring).resolves.toBeNull();
            expect(storage.get()).toBe(fresh);
            expect(stateChange).not.toHaveBeenCalled();
            expect(loggedOut).not.toHaveBeenCalled();
        },
    );

    it("does not let delayed signer resolution overwrite a fresh login", async () => {
        installDocument();
        const pendingSigner = deferred<AccountSigner>();
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
        const storage = createTestStorage(token);
        const { auth } = authFixture(() => pendingSigner.promise, storage);
        vi.spyOn(auth, "me").mockResolvedValue({ accountId: "old", username: "old" });
        const restoring = auth.restoreSession();
        await Promise.resolve();
        const freshSigner = signer({
            accountAddress: "0x3333333333333333333333333333333333333333",
        });
        auth.setAccountSigner(freshSigner);
        const { loginWithWallet } = mockLogin(auth);
        loginWithWallet.mockResolvedValue({
            accessToken: token,
            accountId: "fresh",
            username: "fresh",
        });
        await auth.login({ provider: "other", uri: "https://app.example" });
        pendingSigner.resolve(signer());
        await expect(restoring).resolves.toBeNull();
        expect(auth.getAccountSigner()).toBe(freshSigner);
        expect(auth.getState().mainAccountId).toBe("fresh");
    });

    it.each(["rejected", "expired-during-request"])(
        "clears genuine %s sessions and emits logout",
        async (reason) => {
            vi.useFakeTimers();
            const token = jwtWithExp(Math.floor(Date.now() / 1000) + 60);
            const storage = createTestStorage(token);
            const { auth } = authFixture(signer(), storage);
            auth.hydrateAuthState({ mainAccountId: "account-1", username: "user" });
            const stateChange = vi.fn();
            const loggedOut = vi.fn();
            auth.events.on("stateChange", stateChange);
            auth.events.on("loggedOut", loggedOut);
            const pending = deferred<{ accountId: string; username: string }>();
            vi.spyOn(auth, "me").mockReturnValue(pending.promise);
            const restoring = auth.restoreSession();
            if (reason === "rejected")
                pending.reject(new ConnectError("rejected", Code.Unauthenticated));
            else {
                vi.advanceTimersByTime(61000);
                pending.resolve({ accountId: "account-1", username: "user" });
            }
            await expect(restoring).resolves.toBeNull();
            expect(storage.get()).toBeNull();
            expect(auth.getState().isAuthenticated).toBe(false);
            expect(stateChange).toHaveBeenCalledOnce();
            expect(loggedOut).toHaveBeenCalledOnce();
        },
    );

    it("does not clear bearer authentication when signer restoration fails", async () => {
        const storage = createTestStorage(jwtWithExp(Math.floor(Date.now() / 1000) + 3600));
        const failure = new AuthenticationError("signer unavailable");
        const { auth } = authFixture(async () => {
            throw failure;
        }, storage);
        vi.spyOn(auth, "me").mockResolvedValue({ accountId: "account-1", username: "user" });
        await expect(auth.restoreSession()).rejects.toBe(failure);
        expect(storage.clear).not.toHaveBeenCalled();
        expect(auth.getState().isAuthenticated).toBe(false);
    });

    it("hydrates identity without exposing a fake account signer", async () => {
        const accountSigner = signer();
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
        const tokenStorage = createTestStorage(token);
        const auth = authFixture(accountSigner, tokenStorage).auth;
        installDocument();
        polyesterSession.set({
            environmentFingerprint: POLYESTER_DEVNET_ENVIRONMENT.fingerprint,
            provider: "turnkey",
            loginMethod: null,
            primaryWallet: accountSigner.ownerAddress ?? accountSigner.accountAddress,
            smartAccount: accountSigner.accountAddress,
            activeAccount: {
                accountId: "account-1",
                isMain: true,
                mainAccountId: "account-1",
            },
            username: "hunter",
        });

        auth.hydrateAuthState({
            mainAccountId: "account-1",
            username: "hunter",
            smartAccountAddress: accountSigner.accountAddress,
            ownerAddress: accountSigner.ownerAddress,
        });

        expect(auth.getAccountSigner()).toBeNull();
        expect(auth.getState()).toMatchObject({
            isAuthenticated: true,
            accountAddress: accountSigner.accountAddress,
            ownerAddress: accountSigner.ownerAddress,
            mainAccountId: "account-1",
        });

        const { createWalletChallenge } = mockLogin(auth);
        await auth.login({ uri: "https://app.example", provider: "turnkey" });

        expect(createWalletChallenge).toHaveBeenCalledWith({
            smartAccountAddress: accountSigner.accountAddress,
            signerAddress: accountSigner.ownerAddress,
            uri: "https://app.example",
        });
        expect(accountSigner.signMessage).toHaveBeenCalledWith(
            "server-issued message ☃\nexact bytes",
        );
        expect(auth.getAccountSigner()).toBe(accountSigner);
    });

    it("clears configured token storage when restore sees no matching display session", async () => {
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
        const tokenStorage = createTestStorage(token);
        const { auth, realtime } = authFixture(signer(), tokenStorage);
        const disconnectPrivate = vi.spyOn(realtime, "disconnectPrivate");
        vi.spyOn(auth, "me").mockRejectedValue(new AuthenticationError("session rejected"));

        await expect(auth.restoreSession()).resolves.toBeNull();

        expect(tokenStorage.clear).toHaveBeenCalled();
        expect(disconnectPrivate).toHaveBeenCalledTimes(1);
    });

    it("reports session time to expiry from the configured token storage", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const accountSigner = signer();
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 90);
        const auth = authFixture(accountSigner, createTestStorage(token)).auth;
        installDocument();
        polyesterSession.set({
            environmentFingerprint: POLYESTER_DEVNET_ENVIRONMENT.fingerprint,
            provider: "turnkey",
            loginMethod: null,
            primaryWallet: accountSigner.ownerAddress ?? accountSigner.accountAddress,
            smartAccount: accountSigner.accountAddress,
        });

        expect(auth.getSessionTimeToExpiry()).toBe(90_000);
    });

    it("reports zero session lifetime for a malformed stored token", () => {
        const auth = authFixture(signer(), createTestStorage("not-a-jwt")).auth;

        expect(auth.getSessionTimeToExpiry()).toBe(0);
    });

    it("rejects a signer from another environment before requesting a challenge", async () => {
        const accountSigner = signer({ environmentFingerprint: "0xother" });
        const auth = authService(accountSigner);
        const createWalletChallenge = vi.spyOn(auth, "createWalletChallenge");

        await expect(auth.login({ uri: "https://app.example", provider: "other" })).rejects.toThrow(
            "Account signer environment does not match client environment.",
        );
        expect(createWalletChallenge).not.toHaveBeenCalled();
    });

    it("creates a subaccount with the provided account signer", async () => {
        const rootSigner = signer();
        const subaccountSigner = signer({
            accountAddress: "0x6666666666666666666666666666666666666666",
            ownerAddress: "0x7777777777777777777777777777777777777777",
        });
        const { auth: subaccountAuth, subaccounts } = authFixture(rootSigner);
        mockLogin(subaccountAuth);
        await subaccountAuth.login({ uri: "https://app.example", provider: "turnkey" });
        const createChallenge = mockSubaccountChallenge(
            subaccounts,
            subaccountSigner.accountAddress,
        );
        const create = vi.spyOn(subaccounts, "create");
        const subaccountId = formatId(123n);

        create.mockResolvedValue({
            subaccountId,
            totalCreated: 1,
            smartAccountSaltNonce: 1,
            revision: "9",
        });

        await expect(
            subaccountAuth.createSubaccount({
                uri: "https://app.example",
                accountSigner: subaccountSigner,
                label: "Trading",
            }),
        ).resolves.toEqual({ subaccountId, smartAccountSaltNonce: 1, revision: "9" });

        expect(createChallenge).toHaveBeenCalledWith({
            ownerAddress: rootSigner.ownerAddress,
            uri: "https://app.example",
        });
        expect(subaccountSigner.signMessage).toHaveBeenCalledWith("subaccount server message");
        expect(create).toHaveBeenCalledWith({
            label: "Trading",
            smartAccountAddress: subaccountSigner.accountAddress,
            message: "subaccount server message",
            signature: "0x1234",
        });
    });

    it("creates a subaccount when the main signer is absent", async () => {
        const rootSigner = signer();
        const subaccountSigner = signer({
            accountAddress: "0x6666666666666666666666666666666666666666",
            ownerAddress: "0x7777777777777777777777777777777777777777",
        });
        const { auth: subaccountAuth, subaccounts } = authFixture(rootSigner);
        mockLogin(subaccountAuth);
        await subaccountAuth.login({ uri: "https://app.example", provider: "turnkey" });
        subaccountAuth.setAccountSigner(null);
        await expect(
            subaccountAuth.createSubaccount({
                uri: "https://app.example",
                accountSigner: subaccountSigner,
            }),
        ).rejects.toBeInstanceOf(ConfigurationError);
        const createChallenge = mockSubaccountChallenge(
            subaccounts,
            subaccountSigner.accountAddress,
        );
        const create = vi.spyOn(subaccounts, "create");
        const subaccountId = formatId(123n);

        create.mockResolvedValue({
            subaccountId,
            totalCreated: 1,
            smartAccountSaltNonce: 1,
            revision: "9",
        });

        await expect(
            subaccountAuth.createSubaccount({
                uri: "https://app.example",
                accountSigner: subaccountSigner,
                label: "Trading",
                ownerAddress: rootSigner.ownerAddress,
            }),
        ).resolves.toEqual({ subaccountId, smartAccountSaltNonce: 1, revision: "9" });

        expect(createChallenge).toHaveBeenCalledWith({
            ownerAddress: rootSigner.ownerAddress,
            uri: "https://app.example",
        });
        expect(create).toHaveBeenCalledWith({
            label: "Trading",
            smartAccountAddress: subaccountSigner.accountAddress,
            message: "subaccount server message",
            signature: "0x1234",
        });
    });

    it("derives the subaccount signer from the server challenge and rejects address mismatches", async () => {
        const rootSigner = signer();
        const subaccountSigner = signer({
            accountAddress: "0x6666666666666666666666666666666666666666",
        });
        const { auth: subaccountAuth, subaccounts } = authFixture(rootSigner);
        mockLogin(subaccountAuth);
        await subaccountAuth.login({ uri: "https://app.example", provider: "turnkey" });
        mockSubaccountChallenge(subaccounts, subaccountSigner.accountAddress);
        const create = vi.spyOn(subaccounts, "create").mockResolvedValue({
            subaccountId: "sub",
            totalCreated: 1,
            smartAccountSaltNonce: 1,
            revision: "9",
        });
        const factory = vi.fn(async (challenge: { smartAccountSaltNonce: number }) => {
            expect(challenge.smartAccountSaltNonce).toBe(1);
            return subaccountSigner;
        });

        await subaccountAuth.createSubaccount({
            uri: "https://app.example",
            accountSigner: factory,
        });
        expect(factory).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledTimes(1);

        await expect(
            subaccountAuth.createSubaccount({
                uri: "https://app.example",
                accountSigner: rootSigner,
            }),
        ).rejects.toBeInstanceOf(ConfigurationError);
        expect(rootSigner.signMessage).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledTimes(1);
    });
});
