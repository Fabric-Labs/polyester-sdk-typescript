import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/auth_pb.js";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import { ProfileService } from "./profile/profile.js";
import {
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

import {
    WalletAddressSchema,
    WalletChallengeUriSchema,
    WalletChallengeMessageSchema,
} from "./wallet-challenge.schemas.js";

export const CreateWalletChallengeInputSchema = v.strictObject({
    smartAccountAddress: WalletAddressSchema,
    signerAddress: WalletAddressSchema,
    uri: WalletChallengeUriSchema,
});
export type CreateWalletChallengeInput = v.InferInput<typeof CreateWalletChallengeInputSchema>;

/** An EIP-191 EOA signature: 65 hexadecimal bytes, with an optional 0x prefix. */
const LoginEoaSignatureSchema = v.pipe(
    v.string(),
    v.regex(
        /^(?:0x)?[0-9a-fA-F]{130}$/,
        "Login signature must be a 65-byte hexadecimal EOA signature.",
    ),
);

export const LoginWithWalletInputSchema = v.strictObject({
    smartAccountAddress: WalletAddressSchema,
    message: WalletChallengeMessageSchema,
    signature: LoginEoaSignatureSchema,
    userAgent: v.optional(v.string(), ""),
    ip: v.optional(v.string(), ""),
    walletProvider: v.optional(v.string(), ""),
});

export type LoginWithWalletInput = v.InferInput<typeof LoginWithWalletInputSchema>;

const MeSchema = v.object({
    accountId: PublicIdSchema,
    apiKeyId: v.optional(v.string()),
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

const WalletChallengeSchema = v.object({
    message: WalletChallengeMessageSchema,
    expiresAt: OptionalTimestampMsSchema,
});

export type WalletChallenge = v.InferOutput<typeof WalletChallengeSchema>;

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
     * Records explicit consent to the current terms for the caller's root account.
     * Call only after the user consents. Requires an interactive JWT session;
     * API keys are not allowed. Repeated acceptance succeeds without changing
     * the first acceptance time. No MFA is required.
     */
    async acceptTerms(options?: PolyesterMutationOptions): Promise<void> {
        await this.#authClient.acceptTerms({}, toConnectCallOptions(options));
    }

    /**
     * Requests a server-issued SIWE login message. Sign its exact UTF-8 bytes with
     * personal_sign; do not hash or reconstruct it. Expiry is epoch milliseconds.
     * The backend sets SIWE Chain ID to Ethereum mainnet (1) and binds the
     * Polyester chain in Resources. Do not send a chain ID or rewrite either binding.
     * Wallet adapters must select Ethereum mainnet before signing if required by the wallet.
     * Subaccount creation uses `subaccounts.createChallenge` instead.
     */
    async createWalletChallenge(
        input: CreateWalletChallengeInput,
        options?: PolyesterRequestOptions,
    ): Promise<WalletChallenge> {
        const validated = parse(CreateWalletChallengeInputSchema, input);
        return parse(
            WalletChallengeSchema,
            await this.#publicClient.createWalletChallenge(
                { ...validated, purpose: Proto.WalletChallengePurpose.LOGIN },
                toConnectCallOptions(options),
            ),
        );
    }

    /**
     * Exchanges a signed SIWE message for an authenticated session token and account identity returned by the auth API.
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
