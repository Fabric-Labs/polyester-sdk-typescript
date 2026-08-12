import type { Hex } from "viem";
import { isEvmAddress } from "../utils/evm.js";
import { ConfigurationError } from "../shared/errors.js";

export type HexAddress = `0x${string}`;

/**
 * Minimal account signer interface for SDK operations.
 *
 * The SDK authenticates the Polyester smart account address. The owner address
 * is optional metadata about the EOA or custody provider that controls it.
 */
export interface AccountSigner {
    /** Fingerprint of the PolyesterEnvironment this signer was created for */
    readonly environmentFingerprint: string;

    /** The smart account address (used for authentication and trading) */
    readonly accountAddress: HexAddress;

    /** The owner/EOA address (optional metadata about the controlling signer) */
    readonly ownerAddress?: HexAddress;

    /** Sign a message and return the signature */
    signMessage(message: string): Promise<Hex>;
}

/**
 * Factory function type for lazy account signer initialization.
 * Useful when the signer might not be available at client creation time.
 */
export type AccountSignerFactory = () => AccountSigner | null | Promise<AccountSigner | null>;

/**
 * Account signer configuration for the client.
 * Can be a signer instance or a factory for lazy initialization.
 */
export type AccountSignerConfig = AccountSigner | AccountSignerFactory;

/**
 * Helper to check if an account signer config is a factory function.
 */
export function isAccountSignerFactory(
    config: AccountSignerConfig,
): config is AccountSignerFactory {
    return typeof config === "function";
}

/**
 * Asserts that a value implements the account signer contract.
 */
export function assertAccountSigner(value: AccountSigner): void {
    if (typeof value !== "object" || value === null) {
        throw new ConfigurationError("Account signer must be an object or factory function.");
    }
    if (!value.environmentFingerprint) {
        throw new ConfigurationError("Account signer must include an environmentFingerprint.");
    }
    if (!isEvmAddress(value.accountAddress)) {
        throw new ConfigurationError("Account signer must include a valid accountAddress.");
    }
    if (value.ownerAddress && !isEvmAddress(value.ownerAddress)) {
        throw new ConfigurationError("Account signer ownerAddress must be a valid address.");
    }
    if (typeof value.signMessage !== "function") {
        throw new ConfigurationError("Account signer must include a signMessage function.");
    }
}

/**
 * Helper to resolve an account signer from config.
 */
export async function resolveAccountSigner(
    config: AccountSignerConfig | undefined,
): Promise<AccountSigner | null> {
    if (!config) return null;
    const accountSigner = isAccountSignerFactory(config) ? await config() : config;
    if (accountSigner) assertAccountSigner(accountSigner);
    return accountSigner;
}
