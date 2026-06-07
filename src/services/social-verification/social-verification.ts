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
    ProviderInputSchema,
    type StartVerificationInput,
    type StartVerificationResponse,
    type VerificationReadyResponse,
    type GetVerificationResponse,
    type SocialProvider,
    type SocialVerificationMethod,
} from "./social-verification.schemas.js";
import {
    SocialProviderCodec,
    SocialVerificationMethodCodec,
} from "./social-verification.codecs.js";

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
        provider: SocialProvider,
        options?: PolyesterMutationOptions,
    ): Promise<VerificationReadyResponse> {
        const res = await this.#client.socialVerificationReady(
            {
                provider: v.parse(ProviderInputSchema, provider),
            },
            toConnectCallOptions(options),
        );
        return v.parse(VerificationReadyResponseSchema, res);
    }

    async get(
        provider: SocialProvider,
        options?: PolyesterRequestOptions,
    ): Promise<GetVerificationResponse> {
        const res = await this.#client.getSocialVerification(
            {
                provider: v.parse(ProviderInputSchema, provider),
            },
            toConnectCallOptions(options),
        );
        return v.parse(GetVerificationResponseSchema, res);
    }

    async startTwitter(
        handle: string,
        method: SocialVerificationMethod = "profile",
        options?: PolyesterMutationOptions,
    ): Promise<StartVerificationResponse> {
        const res = await this.#client.startSocialVerification(
            {
                provider: SocialProviderCodec.inputToProto.twitter,
                method: SocialVerificationMethodCodec.inputToProto[method],
                handle: handle.trim().replace(/^@+/, ""),
            },
            toConnectCallOptions(options),
        );
        return v.parse(StartVerificationResponseSchema, res);
    }

    async markTwitterReady(options?: PolyesterMutationOptions): Promise<VerificationReadyResponse> {
        const res = await this.#client.socialVerificationReady(
            {
                provider: SocialProviderCodec.inputToProto.twitter,
            },
            toConnectCallOptions(options),
        );
        return v.parse(VerificationReadyResponseSchema, res);
    }

    async getTwitter(options?: PolyesterRequestOptions): Promise<GetVerificationResponse> {
        const res = await this.#client.getSocialVerification(
            {
                provider: SocialProviderCodec.inputToProto.twitter,
            },
            toConnectCallOptions(options),
        );
        return v.parse(GetVerificationResponseSchema, res);
    }

    async startDiscord(
        handle: string,
        method: SocialVerificationMethod = "channel",
        options?: PolyesterMutationOptions,
    ): Promise<StartVerificationResponse> {
        const res = await this.#client.startSocialVerification(
            {
                provider: SocialProviderCodec.inputToProto.discord,
                method: SocialVerificationMethodCodec.inputToProto[method],
                handle: handle.trim().replace(/^@+/, ""),
            },
            toConnectCallOptions(options),
        );
        return v.parse(StartVerificationResponseSchema, res);
    }

    async markDiscordReady(options?: PolyesterMutationOptions): Promise<VerificationReadyResponse> {
        const res = await this.#client.socialVerificationReady(
            {
                provider: SocialProviderCodec.inputToProto.discord,
            },
            toConnectCallOptions(options),
        );
        return v.parse(VerificationReadyResponseSchema, res);
    }

    async getDiscord(options?: PolyesterRequestOptions): Promise<GetVerificationResponse> {
        const res = await this.#client.getSocialVerification(
            {
                provider: SocialProviderCodec.inputToProto.discord,
            },
            toConnectCallOptions(options),
        );
        return v.parse(GetVerificationResponseSchema, res);
    }
}
