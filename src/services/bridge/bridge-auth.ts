import type { PolyesterWallet, HexAddress } from "../../wallet/types.js";
import { isJwtValid } from "../../utils/jwt.js";
import { bridgeToken } from "../../shared/bridge-token.js";
import { EventEmitter } from "../../utils/event-emitter.js";

export interface BridgeAuthConfig {
	baseUrl: string;
}

export interface BridgeAuthState {
	isAuthenticated: boolean;
	isAuthenticating: boolean;
	error: string | null;
}

export interface BridgeAuthEvents {
	authenticated: void;
	stateChange: BridgeAuthState;
	error: { message: string };
}

export class BridgeAuthService {
	readonly events = new EventEmitter<BridgeAuthEvents>();

	#config: BridgeAuthConfig;
	#token: string | null = null;
	#state: BridgeAuthState = {
		isAuthenticated: false,
		isAuthenticating: false,
		error: null,
	};

	constructor(config: BridgeAuthConfig) {
		this.#config = config;
		this.#restoreToken();
	}

	get state(): BridgeAuthState {
		return { ...this.#state };
	}

	getToken(): string | null {
		return this.#token;
	}

	#updateState(patch: Partial<BridgeAuthState>): void {
		this.#state = { ...this.#state, ...patch };
		this.events.emit("stateChange", this.#state);
	}

	#restoreToken(): void {
		if (typeof document === "undefined") return;

		const token = bridgeToken.get();
		if (token && isJwtValid(token)) {
			this.#token = token;
			this.#updateState({ isAuthenticated: true });
		}
	}

	async authenticate(params: {
		smartAccountAddress: HexAddress;
		signMessage: (message: string) => Promise<HexAddress>;
	}): Promise<void> {
		if (this.#state.isAuthenticating) {
			return;
		}

		if (this.#token && isJwtValid(this.#token)) {
			this.#updateState({ isAuthenticated: true, error: null });
			return;
		}

		this.#updateState({ isAuthenticating: true, error: null });

		try {
			const messageResponse = await fetch(
				`${this.#config.baseUrl}/api/auth/get-signing-message`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ address: params.smartAccountAddress }),
				}
			);

			if (!messageResponse.ok) {
				throw new Error("Failed to get signing message");
			}

			const { message } = (await messageResponse.json()) as { message: string };

			const signature = await params.signMessage(message);

			const loginResponse = await fetch(
				`${this.#config.baseUrl}/api/auth/login-with-wallet`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						fabricWalletAddress: params.smartAccountAddress,
						signature,
						message,
					}),
				}
			);

			if (!loginResponse.ok) {
				const errorText = await loginResponse.text();
				throw new Error(`Login failed: ${errorText}`);
			}

			const { token } = (await loginResponse.json()) as { token: string };

			this.#token = token;
			this.#persistToken(token);

			this.#updateState({
				isAuthenticated: true,
				isAuthenticating: false,
				error: null,
			});
			this.events.emit("authenticated", undefined);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Authentication failed";
			this.#updateState({
				isAuthenticated: false,
				isAuthenticating: false,
				error: message,
			});
			this.events.emit("error", { message });
			throw error;
		}
	}

	async authenticateWithWallet(wallet: PolyesterWallet): Promise<void> {
		await this.authenticate({
			smartAccountAddress: wallet.address,
			signMessage: (msg) => wallet.signMessage(msg),
		});
	}

	clearAuth(): void {
		this.#token = null;
		bridgeToken.clear();
		this.#updateState({
			isAuthenticated: false,
			isAuthenticating: false,
			error: null,
		});
	}

	#persistToken(token: string): void {
		if (typeof document === "undefined") return;
		bridgeToken.set(token);
	}
}
