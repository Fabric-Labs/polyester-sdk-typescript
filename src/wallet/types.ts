export type HexAddress = `0x${string}`;

/**
 * Minimal wallet interface for SDK operations.
 *
 * The SDK doesn't care how you created this wallet - Turnkey, MetaMask,
 * WalletConnect, private key, hardware wallet, etc. You create it in your
 * app and pass it here.
 */
export interface PolyesterWallet {
	/** The smart account address (used for authentication and trading) */
	readonly address: HexAddress;

	/** The owner/EOA wallet address (optional, used for deposits/bridge) */
	readonly ownerAddress?: HexAddress;

	/** Sign a message and return the signature */
	signMessage(message: string): Promise<HexAddress>;
}

/**
 * Factory function type for lazy wallet initialization.
 * Useful when wallet might not be available at client creation time.
 */
export type WalletFactory = () => PolyesterWallet | null | Promise<PolyesterWallet | null>;

/**
 * Wallet configuration for the client.
 * Can be a wallet instance or a factory for lazy initialization.
 */
export type WalletConfig = PolyesterWallet | WalletFactory;

/**
 * Helper to check if a wallet config is a factory function.
 */
export function isWalletFactory(config: WalletConfig): config is WalletFactory {
	return typeof config === "function";
}

/**
 * Helper to resolve a wallet from config.
 */
export async function resolveWallet(
	config: WalletConfig | undefined
): Promise<PolyesterWallet | null> {
	if (!config) return null;
	if (isWalletFactory(config)) return config();
	return config;
}
