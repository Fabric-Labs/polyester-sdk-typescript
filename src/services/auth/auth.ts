import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/auth_pb.js";
import * as v from "valibot";
import { ValidationError } from "../../shared/errors.js";
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
    WalletSignatureSchema,
} from "./wallet-challenge.schemas.js";

export const CreateWalletChallengeInputSchema = v.strictObject({
    smartAccountAddress: WalletAddressSchema,
    signerAddress: WalletAddressSchema,
    uri: WalletChallengeUriSchema,
    purpose: v.picklist(["login", "create_subaccount"]),
});
export type CreateWalletChallengeInput = v.InferInput<typeof CreateWalletChallengeInputSchema>;
export type WalletChallengePurpose = CreateWalletChallengeInput["purpose"];

export const LoginWithWalletInputSchema = v.strictObject({
    smartAccountAddress: WalletAddressSchema,
    message: WalletChallengeMessageSchema,
    signature: WalletSignatureSchema,
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
     * Requests a server-issued SIWE message. Sign its exact UTF-8 bytes with
     * personal_sign; do not hash or reconstruct it. Expiry is epoch milliseconds.
     */
    async createWalletChallenge(
        input: CreateWalletChallengeInput,
        options?: PolyesterRequestOptions,
    ): Promise<WalletChallenge> {
        const validated = parse(CreateWalletChallengeInputSchema, input);
        if (
            validated.purpose === "create_subaccount" &&
            validated.signerAddress.toLowerCase() !== validated.smartAccountAddress.toLowerCase()
        ) {
            throw new ValidationError(
                "Subaccount challenge signer must equal the smart account address.",
            );
        }
        return parse(
            WalletChallengeSchema,
            await this.#publicClient.createWalletChallenge(
                {
                    ...validated,
                    purpose:
                        validated.purpose === "login"
                            ? Proto.WalletChallengePurpose.LOGIN
                            : Proto.WalletChallengePurpose.CREATE_SUBACCOUNT,
                },
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
