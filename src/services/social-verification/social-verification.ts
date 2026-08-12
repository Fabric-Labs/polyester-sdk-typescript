import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/social_verification_pb.js";
import * as v from "../../shared/validation.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import {
    StartVerificationInputSchema,
    StartVerificationResponseSchema,
    VerificationReadyResponseSchema,
    GetVerificationResponseSchema,
    SocialProviderInputSchema,
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

    constructor(transport: Transport) {
        this.#client = createClient(Proto.SocialVerificationService, transport);
    }

    /**
     * Starts or restarts provider verification for a handle, normalizing leading @, defaulting to profile verification, and returning a poly_... challenge code that expires after about 15 minutes.
     */
    async start(
        input: StartVerificationInput,
        options?: PolyesterMutationOptions,
    ): Promise<StartVerificationResponse> {
        const validated = v.parse(StartVerificationInputSchema, input);
        const res = await this.#client.startSocialVerification(
            validated,
            toConnectCallOptions(options),
        );
        return v.parse(StartVerificationResponseSchema, res);
    }

    /**
     * Queues a provider check after the caller has placed the challenge code according to the selected verification method.
     */
    async markReady(
        input: v.InferInput<typeof SocialProviderInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<VerificationReadyResponse> {
        const validated = v.parse(SocialProviderInputSchema, input);
        const res = await this.#client.socialVerificationReady(
            validated,
            toConnectCallOptions(options),
        );
        return v.parse(VerificationReadyResponseSchema, res);
    }

    /**
     * Returns the caller's current verification state for a provider, including status, challenge metadata, attempts, last error, and verified timestamp.
     */
    async get(
        input: v.InferInput<typeof SocialProviderInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<GetVerificationResponse> {
        const validated = v.parse(SocialProviderInputSchema, input);
        const res = await this.#client.getSocialVerification(
            validated,
            toConnectCallOptions(options),
        );
        return v.parse(GetVerificationResponseSchema, res);
    }
}
