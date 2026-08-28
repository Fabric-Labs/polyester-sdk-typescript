import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/auth_pb.js";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import { ProfileService } from "./profile/profile.js";
import {
    OptionalPublicIdSchema,
    OptionalTimestampMsSchema,
    PublicIdSchema,
    TimestampSchema,
} from "../../shared/schemas.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { MfaSessionInfoSchema } from "../mfa/mfa.schemas.js";
import type { PolyesterRealtime } from "../../realtime/index.js";
import type { AuthAndPublicApiTransports } from "../../shared/transports.js";

export const LoginWithWalletInputSchema = v.strictObject({
    smartAccountAddress: v.string(),
    nonce: v.string(),
    signature: v.string(),
    userAgent: v.optional(v.string(), ""),
    ip: v.optional(v.string(), ""),
    primaryWalletAddress: v.optional(v.string(), ""),
    walletProvider: v.optional(v.string(), ""),
});

export type LoginWithWalletInput = v.InferInput<typeof LoginWithWalletInputSchema>;

const MeSchema = v.object({
    accountId: PublicIdSchema,
    apiKeyId: OptionalPublicIdSchema,
    username: v.string(),
    session: v.optional(MfaSessionInfoSchema),
});

export type Me = v.InferOutput<typeof MeSchema>;

const LoginWithWalletResponseSchema = v.object({
    accessToken: v.string(),
    expiresAt: v.optional(TimestampSchema),
    accountId: PublicIdSchema,
    username: v.string(),
});

export type LoginWithWalletResponse = v.InferOutput<typeof LoginWithWalletResponseSchema>;

const NonceSchema = v.object({
    nonce: v.string(),
    expiresAt: OptionalTimestampMsSchema,
});

export type Nonce = v.InferOutput<typeof NonceSchema>;

/**
 * Handles wallet-based authentication, caller introspection, and authenticated profile operations.
 */
export class AuthService {
    #publicClient: Client<typeof Proto.AuthService>;
    #authClient: Client<typeof Proto.AuthService>;
    profile: ProfileService;

    constructor(transports: AuthAndPublicApiTransports, realtime: PolyesterRealtime) {
        this.#publicClient = createClient(Proto.AuthService, transports.publicApi);
        this.#authClient = createClient(Proto.AuthService, transports.authApi);
        this.profile = new ProfileService(transports, realtime);
    }

    /**
     * Returns the authenticated caller's account context, including account ID, optional API key ID, username, and session assurance details from the presented token or API key.
     */
    async me(options?: PolyesterRequestOptions): Promise<Me> {
        const res = await this.#authClient.me({}, toConnectCallOptions(options));
        return parse(MeSchema, res);
    }

    /**
     * Requests a short-lived nonce for the given smart-account EVM address.
     * The nonce is single-purpose, replaced by subsequent requests, and expires
     * after about five minutes. The optional expiry is milliseconds since the
     * Unix epoch.
     */
    async requestLoginNonce(
        smartAccountAddress: string,
        options?: PolyesterRequestOptions,
    ): Promise<Nonce> {
        return parse(
            NonceSchema,
            await this.#publicClient.getNonce(
                { smartAccountAddress },
                toConnectCallOptions(options),
            ),
        );
    }

    /**
     * Exchanges a signed login nonce for an authenticated session token and account identity returned by the auth API.
     */
    protected async loginWithWallet(
        input: LoginWithWalletInput,
        options?: PolyesterMutationOptions,
    ): Promise<LoginWithWalletResponse> {
        const validatedInput = parse(LoginWithWalletInputSchema, input);
        const res = await this.#publicClient.loginWithWallet(
            validatedInput,
            toConnectCallOptions(options),
        );
        return parse(LoginWithWalletResponseSchema, res);
    }
}
