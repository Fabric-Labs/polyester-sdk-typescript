import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/social_verification_pb.js";
import * as v from "valibot";
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

export class SocialVerificationService {
    #client: Client<typeof Proto.SocialVerificationService>;

    constructor(transport: Transport) {
        this.#client = createClient(Proto.SocialVerificationService, transport);
    }

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
