import { describe, expect, it } from "vitest";
import type { AccountSigner } from "./types.js";
import { resolveAccountSigner } from "./types.js";

const signer: AccountSigner = {
    accountAddress: "0x1111111111111111111111111111111111111111",
    ownerAddress: "0x2222222222222222222222222222222222222222",
    signMessage: async () => "0x1234",
};

describe("resolveAccountSigner", () => {
    it("returns null when no account signer is configured", async () => {
        await expect(resolveAccountSigner(undefined)).resolves.toBeNull();
    });

    it("returns a direct account signer", async () => {
        await expect(resolveAccountSigner(signer)).resolves.toBe(signer);
    });

    it("resolves a lazy account signer factory", async () => {
        await expect(resolveAccountSigner(() => signer)).resolves.toBe(signer);
        await expect(resolveAccountSigner(async () => signer)).resolves.toBe(signer);
    });

    it("rejects a signer without a valid account address", async () => {
        await expect(
            resolveAccountSigner({
                ...signer,
                accountAddress: "" as AccountSigner["accountAddress"],
            }),
        ).rejects.toThrow("Account signer must include a valid accountAddress.");
    });
});
