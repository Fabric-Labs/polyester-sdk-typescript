import { describe, expect, it, vi } from "vitest";
import type { AccountSigner } from "./account-signer/index.js";
import { PolyesterBrowserClient } from "./browser-client.js";
import { POLYESTER_TESTNET_ENVIRONMENT } from "./environment.js";
import { AccountSignerAuthService } from "./services/auth/account-signer-auth.js";

vi.mock("./catalogs/catalog-refresh.js", () => ({
    refreshCatalogsInBackground: vi.fn(),
}));

function signer(accountAddress: AccountSigner["accountAddress"]): AccountSigner {
    return {
        environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        accountAddress,
        ownerAddress: "0x2222222222222222222222222222222222222222",
        signMessage: async () => "0xsignature",
    };
}

describe("PolyesterBrowserClient", () => {
    it("accepts an accountSigner config", () => {
        const accountSigner = signer("0x1111111111111111111111111111111111111111");
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            accountSigner,
        });

        expect(client.auth).toBeInstanceOf(AccountSignerAuthService);
        expect(client.auth.getAccountSigner()).toBeNull();
    });

    it("updates the auth account signer via setAccountSigner", () => {
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });
        const accountSigner = signer("0x3333333333333333333333333333333333333333");

        client.setAccountSigner(accountSigner);

        expect(client.auth.getAccountSigner()).toBe(accountSigner);
        expect(client.auth.getState().accountAddress).toBe(accountSigner.accountAddress);
    });

    it("rejects an account signer from another environment", () => {
        const client = new PolyesterBrowserClient({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
        });
        const accountSigner = {
            ...signer("0x3333333333333333333333333333333333333333"),
            environmentFingerprint: "0xother",
        };

        expect(() => client.setAccountSigner(accountSigner)).toThrow(
            "Account signer environment does not match client environment.",
        );
    });
});
