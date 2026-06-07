import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { SAFE_SMART_ACCOUNT_CONFIG } from "../shared/config.js";
import { createPolyesterAccountSigner } from "./create-polyester-account-signer.js";
import { predictSafeAddress } from "./predict-safe-address.js";

const owner = privateKeyToAccount(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
);

describe("createPolyesterAccountSigner", () => {
    it("returns a deterministic account address and owner metadata without Safe config params", () => {
        const accountSigner = createPolyesterAccountSigner({ owner, saltNonce: 7n });
        const {
            safeProxyFactoryAddress,
            safeSingletonAddress,
            safeModuleSetupAddress,
            safe4337ModuleAddress,
            multiSendAddress,
        } = SAFE_SMART_ACCOUNT_CONFIG;

        if (
            !safeProxyFactoryAddress ||
            !safeSingletonAddress ||
            !safeModuleSetupAddress ||
            !safe4337ModuleAddress ||
            !multiSendAddress
        ) {
            throw new Error("Test requires complete Polyester Safe config.");
        }

        expect(accountSigner.accountAddress).toBe(
            predictSafeAddress({
                owners: [owner.address],
                saltNonce: 7n,
                safeProxyFactoryAddress,
                safeSingletonAddress,
                safeModuleSetupAddress,
                safe4337ModuleAddress,
                multiSendAddress,
            }),
        );
        expect(accountSigner.ownerAddress).toBe(owner.address);
    });

    it("returns ERC-6492 wrapped signatures for login messages", async () => {
        const accountSigner = createPolyesterAccountSigner({ owner });
        const signature = await accountSigner.signMessage("Polyester Login\n\nNonce: test");

        expect(signature).toMatch(/^0x[0-9a-f]+$/iu);
        expect(
            signature.endsWith("6492649264926492649264926492649264926492649264926492649264926492"),
        ).toBe(true);
    });
});
