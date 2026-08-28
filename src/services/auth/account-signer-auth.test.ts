import type { Transport } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountSigner } from "../../account-signer/index.js";
import { POLYESTER_TESTNET_ENVIRONMENT } from "../../environment.js";
import { RealtimeClient } from "../../realtime/index.js";
import { formatId } from "../../utils/base58-id.js";
import { SubaccountsService } from "../subaccounts/index.js";
import { AccountSignerAuthService } from "./account-signer-auth.js";
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

function authFixture(accountSigner?: AccountSigner, tokenStorage?: AuthTokenStorage) {
    const publicApi = noopTransport();
    const authApi = noopTransport();
    const realtime = new RealtimeClient({
        wsUrl: POLYESTER_TESTNET_ENVIRONMENT.websocketUrl,
        tokenEndpoint: `${POLYESTER_TESTNET_ENVIRONMENT.apiUrl}/v1/rt/token`,
        subscribeEndpoint: `${POLYESTER_TESTNET_ENVIRONMENT.apiUrl}/v1/rt/subscribe`,
        hasAuth: () => false,
    });
    const subaccounts = new SubaccountsService({ publicApi, authApi }, realtime);

    const auth = new AccountSignerAuthService({
        transports: { publicApi, authApi },
        accountSignerConfig: accountSigner,
        environment: POLYESTER_TESTNET_ENVIRONMENT,
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
        environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        accountAddress: "0x1111111111111111111111111111111111111111",
        ownerAddress: "0x2222222222222222222222222222222222222222",
        signMessage,
        ...params,
    };
}

function mockLogin(auth: AccountSignerAuthService) {
    const requestLoginNonce = vi
        .spyOn(auth, "requestLoginNonce")
        .mockResolvedValue({ nonce: "nonce-1" });
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

    return { requestLoginNonce, loginWithWallet };
}

describe("AccountSignerAuthService", () => {
    afterEach(() => {
        polyesterSession.clear();
        vi.restoreAllMocks();
        vi.useRealTimers();
        if (originalDocument) {
            Object.defineProperty(globalThis, "document", originalDocument);
        } else {
            Reflect.deleteProperty(globalThis, "document");
        }
    });

    it("maps account signer fields to the backend wallet login payload", async () => {
        const accountSigner = signer();
        const auth = authService(accountSigner);
        const { requestLoginNonce, loginWithWallet } = mockLogin(auth);

        await auth.login({ provider: "turnkey" });

        expect(requestLoginNonce).toHaveBeenCalledWith(accountSigner.accountAddress);
        expect(accountSigner.signMessage).toHaveBeenCalledWith("Polyester Login\n\nNonce: nonce-1");
        expect(loginWithWallet).toHaveBeenCalledWith({
            smartAccountAddress: accountSigner.accountAddress,
            nonce: "nonce-1",
            signature: "0x1234",
            primaryWalletAddress: accountSigner.ownerAddress,
            walletProvider: "turnkey",
        });
        expect(auth.getState()).toMatchObject({
            isAuthenticated: true,
            accountAddress: accountSigner.accountAddress,
            ownerAddress: accountSigner.ownerAddress,
        });
    });

    it("does not substitute ownerAddress for accountAddress", async () => {
        const accountSigner = signer({
            accountAddress: "0x3333333333333333333333333333333333333333",
            ownerAddress: "0x4444444444444444444444444444444444444444",
        });
        const auth = authService(accountSigner);
        const { requestLoginNonce, loginWithWallet } = mockLogin(auth);

        await auth.login({ provider: "metamask" });

        expect(requestLoginNonce).toHaveBeenCalledWith(accountSigner.accountAddress);
        expect(loginWithWallet.mock.calls[0]?.[0]).toMatchObject({
            smartAccountAddress: accountSigner.accountAddress,
            primaryWalletAddress: accountSigner.ownerAddress,
        });
    });

    it("uses accountAddress as primary wallet metadata when ownerAddress is absent", async () => {
        const accountSigner = signer({ ownerAddress: undefined });
        const auth = authService(accountSigner);
        const { loginWithWallet } = mockLogin(auth);

        await auth.login({ provider: "other" });

        expect(loginWithWallet.mock.calls[0]?.[0]).toMatchObject({
            smartAccountAddress: accountSigner.accountAddress,
            primaryWalletAddress: accountSigner.accountAddress,
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
        const { requestLoginNonce } = mockLogin(auth);

        auth.setAccountSigner(replacementSigner);
        await auth.login({ provider: "other" });

        expect(requestLoginNonce).toHaveBeenCalledWith(replacementSigner.accountAddress);
    });

    it("stores login tokens through the configured token storage", async () => {
        const accountSigner = signer();
        const tokenStorage = createTestStorage();
        const auth = authFixture(accountSigner, tokenStorage).auth;
        mockLogin(auth);

        await auth.login({ provider: "turnkey" });

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

        await auth.login({ provider: "turnkey" });
        loginWithWallet.mockResolvedValueOnce({
            accessToken: "token-2",
            accountId: "account-1",
            username: "hunter",
            expiresAt: {
                seconds: 1n,
                nanos: 0,
            },
        });
        await auth.refreshSession();

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

        await auth.login({ provider: "turnkey" });
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

        await auth.refreshSession();

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

        await auth.login({ provider: "turnkey" });
        auth.switchAccount("sub-1", { label: "Operations" });
        loginWithWallet.mockResolvedValueOnce({
            accessToken: "token-2",
            accountId: "account-2",
            username: "hunter",
            expiresAt: { seconds: 2n, nanos: 0 },
        });

        await auth.refreshSession();

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

        await auth.login({ provider: "turnkey" });
        await auth.logout();

        expect(tokenStorage.clear).toHaveBeenCalledTimes(1);
        expect(disconnectPrivate).toHaveBeenCalledTimes(1);
    });

    it("resolves logout and notifies every listener when one listener throws", async () => {
        const tokenStorage = createTestStorage();
        const auth = authFixture(signer(), tokenStorage).auth;
        const laterListener = vi.fn();
        mockLogin(auth);
        await auth.login({ provider: "turnkey" });

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
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
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

    it("hydrates identity without exposing a fake account signer", async () => {
        const accountSigner = signer();
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
        const tokenStorage = createTestStorage(token);
        const auth = authFixture(accountSigner, tokenStorage).auth;
        installDocument();
        polyesterSession.set({
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
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

        const { requestLoginNonce } = mockLogin(auth);
        await auth.login({ provider: "turnkey" });

        expect(requestLoginNonce).toHaveBeenCalledWith(accountSigner.accountAddress);
        expect(accountSigner.signMessage).toHaveBeenCalledWith("Polyester Login\n\nNonce: nonce-1");
        expect(auth.getAccountSigner()).toBe(accountSigner);
    });

    it("clears configured token storage when restore sees no matching display session", async () => {
        const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
        const tokenStorage = createTestStorage(token);
        const { auth, realtime } = authFixture(signer(), tokenStorage);
        const disconnectPrivate = vi.spyOn(realtime, "disconnectPrivate");

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
            environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
            provider: "turnkey",
            loginMethod: null,
            primaryWallet: accountSigner.ownerAddress ?? accountSigner.accountAddress,
            smartAccount: accountSigner.accountAddress,
        });

        expect(auth.getSessionTimeToExpiry()).toBe(90_000);
    });

    it("rejects a signer from another environment before requesting a nonce", async () => {
        const accountSigner = signer({ environmentFingerprint: "0xother" });
        const auth = authService(accountSigner);
        const requestLoginNonce = vi.spyOn(auth, "requestLoginNonce");

        await expect(auth.login({ provider: "other" })).rejects.toThrow(
            "Account signer environment does not match client environment.",
        );
        expect(requestLoginNonce).not.toHaveBeenCalled();
    });

    it("creates a subaccount with the provided account signer", async () => {
        const rootSigner = signer();
        const subaccountSigner = signer({
            accountAddress: "0x6666666666666666666666666666666666666666",
            ownerAddress: "0x7777777777777777777777777777777777777777",
        });
        const { auth: subaccountAuth, subaccounts } = authFixture(rootSigner);
        mockLogin(subaccountAuth);
        await subaccountAuth.login({ provider: "turnkey" });
        const subaccountRequestLoginNonce = vi
            .spyOn(subaccountAuth, "requestLoginNonce")
            .mockResolvedValue({ nonce: "sub-nonce" });
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
                accountSigner: subaccountSigner,
                label: "Trading",
                walletProvider: "turnkey",
            }),
        ).resolves.toEqual({ subaccountId, smartAccountSaltNonce: 1, revision: "9" });

        expect(subaccountRequestLoginNonce).toHaveBeenCalledWith(subaccountSigner.accountAddress);
        expect(subaccountSigner.signMessage).toHaveBeenCalledWith(
            "Polyester Login\n\nNonce: sub-nonce",
        );
        expect(create).toHaveBeenCalledWith({
            label: "Trading",
            smartAccountAddress: subaccountSigner.accountAddress,
            nonce: "sub-nonce",
            signature: "0x1234",
            primaryWalletAddress: rootSigner.ownerAddress,
            walletProvider: "turnkey",
        });
    });

    it("falls back to param account signer ownerAddress when main signer is absent", async () => {
        const rootSigner = signer();
        const subaccountSigner = signer({
            accountAddress: "0x6666666666666666666666666666666666666666",
            ownerAddress: "0x7777777777777777777777777777777777777777",
        });
        const { auth: subaccountAuth, subaccounts } = authFixture(rootSigner);
        mockLogin(subaccountAuth);
        await subaccountAuth.login({ provider: "turnkey" });
        subaccountAuth.setAccountSigner(null);
        const subaccountRequestLoginNonce = vi
            .spyOn(subaccountAuth, "requestLoginNonce")
            .mockResolvedValue({ nonce: "sub-nonce" });
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
                accountSigner: subaccountSigner,
                label: "Trading",
                walletProvider: "metamask",
            }),
        ).resolves.toEqual({ subaccountId, smartAccountSaltNonce: 1, revision: "9" });

        expect(subaccountRequestLoginNonce).toHaveBeenCalledWith(subaccountSigner.accountAddress);
        expect(create).toHaveBeenCalledWith({
            label: "Trading",
            smartAccountAddress: subaccountSigner.accountAddress,
            nonce: "sub-nonce",
            signature: "0x1234",
            primaryWalletAddress: subaccountSigner.ownerAddress,
            walletProvider: "metamask",
        });
    });
});
