import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/social_verification_pb.js";
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

	async start(input: StartVerificationInput): Promise<StartVerificationResponse> {
		const validated = StartVerificationInputSchema.parse(input);
		const res = await this.#client.startSocialVerification(validated);
		return StartVerificationResponseSchema.parse(res);
	}

	async markReady(provider: SocialProvider): Promise<VerificationReadyResponse> {
		const res = await this.#client.socialVerificationReady({
			provider: ProviderInputSchema.parse(provider),
		});
		return VerificationReadyResponseSchema.parse(res);
	}

	async get(provider: SocialProvider): Promise<GetVerificationResponse> {
		const res = await this.#client.getSocialVerification({
			provider: ProviderInputSchema.parse(provider),
		});
		return GetVerificationResponseSchema.parse(res);
	}

	async startTwitter(
		handle: string,
		method: SocialVerificationMethod = "profile"
	): Promise<StartVerificationResponse> {
		const res = await this.#client.startSocialVerification({
			provider: SocialProviderCodec.inputToProto.twitter,
			method: SocialVerificationMethodCodec.inputToProto[method],
			handle: handle.trim().replace(/^@+/, ""),
		});
		return StartVerificationResponseSchema.parse(res);
	}

	async markTwitterReady(): Promise<VerificationReadyResponse> {
		const res = await this.#client.socialVerificationReady({
			provider: SocialProviderCodec.inputToProto.twitter,
		});
		return VerificationReadyResponseSchema.parse(res);
	}

	async getTwitter(): Promise<GetVerificationResponse> {
		const res = await this.#client.getSocialVerification({
			provider: SocialProviderCodec.inputToProto.twitter,
		});
		return GetVerificationResponseSchema.parse(res);
	}

	async startDiscord(
		handle: string,
		method: SocialVerificationMethod = "channel"
	): Promise<StartVerificationResponse> {
		const res = await this.#client.startSocialVerification({
			provider: SocialProviderCodec.inputToProto.discord,
			method: SocialVerificationMethodCodec.inputToProto[method],
			handle: handle.trim().replace(/^@+/, ""),
		});
		return StartVerificationResponseSchema.parse(res);
	}

	async markDiscordReady(): Promise<VerificationReadyResponse> {
		const res = await this.#client.socialVerificationReady({
			provider: SocialProviderCodec.inputToProto.discord,
		});
		return VerificationReadyResponseSchema.parse(res);
	}

	async getDiscord(): Promise<GetVerificationResponse> {
		const res = await this.#client.getSocialVerification({
			provider: SocialProviderCodec.inputToProto.discord,
		});
		return GetVerificationResponseSchema.parse(res);
	}
}
