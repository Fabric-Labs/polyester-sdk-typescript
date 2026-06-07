import type { Transport } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountSigner } from "../../account-signer/index.js";
import { RealtimeClient } from "../../realtime/index.js";
import { polyesterSession } from "../../shared/polyester-session.js";
import { polyesterToken } from "../../shared/polyester-token.js";
import { formatId } from "../../utils/base58-id.js";
import { SubaccountsService } from "../subaccounts/index.js";
import { AccountSignerAuthService } from "./account-signer-auth.js";
import type { LoginWithWalletInput, LoginWithWalletResponse } from "./auth.js";

function noopTransport(): Transport {
    return {
        unary: vi.fn(),
        stream: vi.fn(),
    } as unknown as Transport;
}

function authFixture(accountSigner?: AccountSigner) {
    const publicApi = noopTransport();
    const authApi = noopTransport();
    const realtime = new RealtimeClient({ hasAuth: () => false });
    const subaccounts = new SubaccountsService(authApi, realtime);

    const auth = new AccountSignerAuthService({
        transports: { publicApi, authApi },
        accountSignerConfig: accountSigner,
        subaccounts,
        realtime,
    });

    return { auth, subaccounts };
}

function authService(accountSigner?: AccountSigner) {
    return authFixture(accountSigner).auth;
}

function signer(params: Partial<AccountSigner> = {}): AccountSigner {
    return {
        accountAddress: "0x1111111111111111111111111111111111111111",
        ownerAddress: "0x2222222222222222222222222222222222222222",
        signMessage: vi.fn(async () => "0x1234"),
        ...params,
    };
}

function mockLogin(auth: AccountSignerAuthService) {
    const requestLoginNonce = vi
        .spyOn(auth, "requestLoginNonce")
        .mockResolvedValue({ nonce: "nonce-1" });
    const loginWithWallet = vi
        .spyOn(
            auth as unknown as { loginWithWallet(input: LoginWithWalletInput): Promise<LoginWithWalletResponse> },
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
        polyesterToken.clear();
        polyesterSession.clear();
        vi.restoreAllMocks();
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

        create.mockResolvedValue({
            subaccountId: 123n,
            totalCreated: 1,
        } as Awaited<ReturnType<SubaccountsService["create"]>>);

        await expect(
            subaccountAuth.createSubaccount({
                accountSigner: subaccountSigner,
                label: "Trading",
                walletProvider: "turnkey",
            }),
        ).resolves.toEqual({ subaccountId: formatId(123n) });

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
});
