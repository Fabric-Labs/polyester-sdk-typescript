import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Interceptor } from "@connectrpc/connect";
import type { AccountSigner } from "./account-signer/index.js";
import { PolyesterBrowserClient } from "./browser-client.js";
import { POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";
import { AccountSignerAuthService } from "./services/auth/account-signer-auth.js";
import { MarketDataService } from "./services/market-data/index.js";
import { ZipperService } from "./services/zipper/index.js";

function signer(accountAddress: AccountSigner["accountAddress"]): AccountSigner {
    return {
        environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        accountAddress,
        ownerAddress: "0x2222222222222222222222222222222222222222",
        signMessage: async () => "0xsignature",
    };
}

function mockCatalogRefreshEndpoints(): {
    getSpotConfig: ReturnType<typeof vi.spyOn>;
    getDepositWithdrawConfig: ReturnType<typeof vi.spyOn>;
} {
    return {
        getSpotConfig: vi
            .spyOn(MarketDataService.prototype, "getSpotConfig")
            .mockResolvedValue({ assets: [], pairs: [], tsSec: 0 }),
        getDepositWithdrawConfig: vi
            .spyOn(ZipperService.prototype, "getDepositWithdrawConfig")
            .mockResolvedValue({
                chains: [],
                assets: [],
                polyesterChainId: 0,
                contracts: [],
                tsMs: 0,
            }),
    };
}

describe("PolyesterBrowserClient", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        vi.restoreAllMocks();
    });

    it("accepts an accountSigner config", () => {
        const accountSigner = signer("0x1111111111111111111111111111111111111111");
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            accountSigner,
            refreshCatalogs: false,
        });

        expect(client.auth).toBeInstanceOf(AccountSignerAuthService);
        expect(client.auth.getAccountSigner()).toBeNull();
    });

    it("refreshes catalogs in the background by default", () => {
        const refresh = mockCatalogRefreshEndpoints();

        new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });

        expect(refresh.getSpotConfig).toHaveBeenCalledTimes(1);
        expect(refresh.getDepositWithdrawConfig).toHaveBeenCalledTimes(1);
    });

    it("skips background catalog refresh when disabled", () => {
        const refresh = mockCatalogRefreshEndpoints();

        new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });

        expect(refresh.getSpotConfig).not.toHaveBeenCalled();
        expect(refresh.getDepositWithdrawConfig).not.toHaveBeenCalled();
    });

    it("refreshes catalogs explicitly", async () => {
        const refresh = mockCatalogRefreshEndpoints();
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });

        await client.refreshCatalogs();

        expect(refresh.getSpotConfig).toHaveBeenCalledTimes(1);
        expect(refresh.getDepositWithdrawConfig).toHaveBeenCalledTimes(1);
    });

    it("accepts shared transport and realtime config", () => {
        const passthroughInterceptor: Interceptor = (next) => (req) => next(req);
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            interceptors: [passthroughInterceptor],
            wireFormat: "json",
            refreshCatalogs: false,
            realtime: {
                getAuthHeaders: () => ({ authorization: "Bearer test" }),
                hasAuth: () => true,
            },
        });

        expect(client.auth).toBeInstanceOf(AccountSignerAuthService);
    });

    it("updates the auth account signer via setAccountSigner", () => {
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });
        const accountSigner = signer("0x3333333333333333333333333333333333333333");

        client.setAccountSigner(accountSigner);

        expect(client.auth.getAccountSigner()).toBe(accountSigner);
        expect(client.auth.getState().accountAddress).toBe(accountSigner.accountAddress);
    });

    it("rejects an account signer from another environment", () => {
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });
        const accountSigner = {
            ...signer("0x3333333333333333333333333333333333333333"),
            environmentFingerprint: "0xother",
        };

        expect(() => client.setAccountSigner(accountSigner)).toThrow(
            "Account signer environment does not match client environment.",
        );
    });

    it("wires browser auth to the client subaccounts service during construction", async () => {
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            refreshCatalogs: false,
        });
        const rootSigner = signer("0x1111111111111111111111111111111111111111");
        const subaccountSigner = signer("0x4444444444444444444444444444444444444444");
        const create = vi.spyOn(client.subaccounts, "create").mockResolvedValue({
            subaccountId: "subaccount-1",
            totalCreated: 1,
        });
        vi.spyOn(client.auth, "requestLoginNonce").mockResolvedValue({ nonce: "nonce-1" });

        client.auth.hydrateAuthState({
            mainAccountId: "main-1",
            username: "hunter",
            smartAccountAddress: rootSigner.accountAddress,
            ownerAddress: rootSigner.ownerAddress,
        });

        await expect(
            client.auth.createSubaccount({
                accountSigner: subaccountSigner,
                label: "Trading",
                walletProvider: "turnkey",
            }),
        ).resolves.toEqual({ subaccountId: "subaccount-1" });

        expect(create).toHaveBeenCalledWith({
            label: "Trading",
            smartAccountAddress: subaccountSigner.accountAddress,
            nonce: "nonce-1",
            signature: "0xsignature",
            primaryWalletAddress: rootSigner.ownerAddress,
            walletProvider: "turnkey",
        });
    });
});
