import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/auth_pb";
import { z } from "zod";
import { ProfileService } from "./profile/profile.js";
import { formatId } from "../../utils/base58-id";
import { TimestampSchema } from "../../shared/schemas";
import { MfaSessionInfoSchema } from "../mfa/mfa.schemas.js";

export const LoginWithWalletInputSchema = z.object({
	smartAccountAddress: z.string(),
	nonce: z.string(),
	signature: z.string(),
	userAgent: z.string().optional().default(""),
	ip: z.string().optional().default(""),
	primaryWalletAddress: z.string().optional().default(""),
	walletProvider: z.string().optional().default(""),
});

export type LoginWithWalletInput = z.input<typeof LoginWithWalletInputSchema>;

export interface AuthServiceTransports {
	publicApi: Transport;
	authApi: Transport;
}

const MeSchema = z.object({
	accountId: z.bigint().transform(formatId),
	apiKeyId: z
		.bigint()
		.optional()
		.transform((v) => (v ? formatId(v) : undefined)),
	username: z.string(),
	session: MfaSessionInfoSchema.optional(),
});

export type Me = z.output<typeof MeSchema>;

const LoginWithWalletResponseSchema = z.object({
	accessToken: z.string(),
	expiresAt: TimestampSchema.optional(),
	accountId: z.bigint().transform(formatId),
	username: z.string(),
});

export type LoginWithWalletResponse = z.output<typeof LoginWithWalletResponseSchema>;

const NonceSchema = z.object({
	nonce: z.string(),
	expiresAt: TimestampSchema.optional(),
});

export type Nonce = z.output<typeof NonceSchema>;

export class AuthService {
	#publicClient: Client<typeof Proto.AuthService>;
	#authClient: Client<typeof Proto.AuthService>;
	profile: ProfileService;

	constructor(transports: AuthServiceTransports) {
		this.#publicClient = createClient(Proto.AuthService, transports.publicApi);
		this.#authClient = createClient(Proto.AuthService, transports.authApi);
		this.profile = new ProfileService(transports.authApi);
	}

	async me(): Promise<Me> {
		const res = await this.#authClient.me({});
		return MeSchema.parse(res);
	}

	async requestLoginNonce(smartAccountAddress: string): Promise<Nonce> {
		return NonceSchema.parse(await this.#publicClient.getNonce({ smartAccountAddress }));
	}

	protected async loginWithWallet(input: LoginWithWalletInput): Promise<LoginWithWalletResponse> {
		const validatedInput = LoginWithWalletInputSchema.parse(input);
		const res = await this.#publicClient.loginWithWallet(validatedInput);
		return LoginWithWalletResponseSchema.parse(res);
	}
}
