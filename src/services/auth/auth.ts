import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/auth_pb.js";
import * as v from "valibot";
import { ProfileService } from "./profile/profile.js";
import { formatId } from "../../utils/base58-id.js";
import { TimestampSchema } from "../../shared/schemas.js";
import { MfaSessionInfoSchema } from "../mfa/mfa.schemas.js";

export const LoginWithWalletInputSchema = v.object({
    smartAccountAddress: v.string(),
    nonce: v.string(),
    signature: v.string(),
    userAgent: v.optional(v.optional(v.string()), ""),
    ip: v.optional(v.optional(v.string()), ""),
    primaryWalletAddress: v.optional(v.optional(v.string()), ""),
    walletProvider: v.optional(v.optional(v.string()), ""),
});

export type LoginWithWalletInput = v.InferInput<typeof LoginWithWalletInputSchema>;

export interface AuthServiceTransports {
    publicApi: Transport;
    authApi: Transport;
}

const MeSchema = v.object({
    accountId: v.pipe(
        v.bigint(),
        v.transform((value) => formatId(value)),
    ),
    apiKeyId: v.pipe(
        v.optional(v.bigint()),
        v.transform((v) => (v ? formatId(v) : undefined)),
    ),
    username: v.string(),
    session: v.optional(MfaSessionInfoSchema),
});

export type Me = v.InferOutput<typeof MeSchema>;

const LoginWithWalletResponseSchema = v.object({
    accessToken: v.string(),
    expiresAt: v.optional(TimestampSchema),
    accountId: v.pipe(
        v.bigint(),
        v.transform((value) => formatId(value)),
    ),
    username: v.string(),
});

export type LoginWithWalletResponse = v.InferOutput<typeof LoginWithWalletResponseSchema>;

const NonceSchema = v.object({
    nonce: v.string(),
    expiresAt: v.optional(TimestampSchema),
});

export type Nonce = v.InferOutput<typeof NonceSchema>;

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
        return v.parse(MeSchema, res);
    }

    async requestLoginNonce(smartAccountAddress: string): Promise<Nonce> {
        return v.parse(NonceSchema, await this.#publicClient.getNonce({ smartAccountAddress }));
    }

    protected async loginWithWallet(input: LoginWithWalletInput): Promise<LoginWithWalletResponse> {
        const validatedInput = v.parse(LoginWithWalletInputSchema, input);
        const res = await this.#publicClient.loginWithWallet(validatedInput);
        return v.parse(LoginWithWalletResponseSchema, res);
    }
}
