import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/social_verification_pb.js";
import type * as v from "valibot";
import { parse } from "../../shared/validation.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import {
    ConfirmVerificationInputSchema,
    UnlinkSocialAccountInputSchema,
    StartVerificationInputSchema,
    StartVerificationResponseSchema,
    VerificationReadyResponseSchema,
    GetVerificationResponseSchema,
    SocialProviderInputSchema,
    type ConfirmVerificationInput,
    type UnlinkSocialAccountInput,
    type StartVerificationInput,
    type StartVerificationResponse,
    type VerificationReadyResponse,
    type GetVerificationResponse,
} from "./social-verification.schemas.js";

/**
 * Verifies ownership of external social accounts for the authenticated caller.
 */
export class SocialVerificationService {
    #client: Client<typeof Proto.SocialVerificationService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.SocialVerificationService, transports.authApi);
    }

    /**
     * Starts or restarts provider verification. Twitter requires a handle and strips a leading @; Discord and Telegram get their identity from the provider bot. An omitted method uses the provider default (Twitter profile, Discord channel, Telegram dm). Discord and Telegram return an empty challengeCode when no new challenge is issued. For Telegram, open `actionUrl` to send the code to the Polyester bot, poll `get` until `awaiting_confirmation`, then `confirm`; while a Telegram account is linked, starting again throws until it is unlinked.
     */
    async start(
        input: StartVerificationInput,
        options?: PolyesterMutationOptions,
    ): Promise<StartVerificationResponse> {
        const validated = parse(StartVerificationInputSchema, input);
        const res = await this.#client.startSocialVerification(
            validated,
            toConnectCallOptions(options),
        );
        return parse(StartVerificationResponseSchema, res);
    }

    /**
     * Queues a provider check after the caller has placed the challenge code according to the selected verification method. Not used for Telegram, which links through `confirm`.
     */
    async markReady(
        input: v.InferInput<typeof SocialProviderInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<VerificationReadyResponse> {
        const validated = parse(SocialProviderInputSchema, input);
        const res = await this.#client.socialVerificationReady(
            validated,
            toConnectCallOptions(options),
        );
        return parse(VerificationReadyResponseSchema, res);
    }

    /**
     * Returns the caller's current verification state for a provider, including status, challenge metadata, attempts, last error, and verified timestamp. API keys need `read-social-verification` and must be scoped to the main account.
     */
    async get(
        input: v.InferInput<typeof SocialProviderInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<GetVerificationResponse> {
        const validated = parse(SocialProviderInputSchema, input);
        const res = await this.#client.getSocialVerification(
            validated,
            toConnectCallOptions(options),
        );
        return parse(GetVerificationResponseSchema, res);
    }

    /**
     * Links the Telegram account that sent the challenge code. Pass the `providerUserId` shown
     * while the verification is `awaiting_confirmation`, so the user links exactly the account
     * they were shown. Requires enrolled MFA and a fresh `stepUpToken`; a retried confirmation of
     * an existing link needs no new token. A mismatched ID or no account awaiting confirmation
     * fails with `social_verification_invalid_state`; a Telegram account linked elsewhere fails
     * the verification with `social_account_already_linked`.
     */
    async confirm(
        input: ConfirmVerificationInput,
        options?: PolyesterMutationOptions,
    ): Promise<GetVerificationResponse> {
        const validated = parse(ConfirmVerificationInputSchema, input);
        const res = await this.#client.confirmSocialVerification(
            validated,
            toConnectCallOptions(options),
        );
        return parse(GetVerificationResponseSchema, res);
    }

    /**
     * Unlinks the Telegram account, or cancels a link in progress, and returns the `canceled`
     * verification (absent if none was ever started). Repeating it changes nothing; start a new
     * verification to link again.
     */
    async unlink(
        input: UnlinkSocialAccountInput,
        options?: PolyesterMutationOptions,
    ): Promise<GetVerificationResponse> {
        const validated = parse(UnlinkSocialAccountInputSchema, input);
        const res = await this.#client.unlinkSocialAccount(
            validated,
            toConnectCallOptions(options),
        );
        return parse(GetVerificationResponseSchema, res);
    }
}
