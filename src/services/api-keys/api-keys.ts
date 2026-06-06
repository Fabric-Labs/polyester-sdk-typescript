import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/api_keys_pb";
import { z } from "zod";
import { removeUndefined } from "../../utils/remove-undefined";
import { stepUpCallOptions } from "../../utils/step-up-call-options";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver";
import { bytesToHex } from "@noble/hashes/utils";
import { keygenAsync } from "@noble/ed25519";
import { connectProtoChannel } from "../../realtime";
import type { BaseSubscribeInput } from "../../shared/types";
import {
	ApiKeysListInputSchema,
	ApiKeysCreateInputSchema,
	ApiKeysUpdateInputSchema,
	ApiKeySchema,
	ApiKeysSchema,
	type ApiKey,
} from "./api-keys.schemas";
import { createLocalMockNoopSubscription } from "../../mock/local-mock-subscription";
import type { LocalMockRuntime } from "../../mock/local-mock-runtime";

interface SubscribeApiKeysInput extends BaseSubscribeInput<ApiKey> {
	accountId: string;
}

/** Optional fresh step-up token from {@link MfaService} after `freshStepUp` challenge completion. */
export type ApiKeysMutationOptions = {
	stepUpToken?: string | null;
};

export class ApiKeysService {
	#client: Client<typeof Proto.ApiKeyService>;
	#resolver?: SubAccountResolver;
	#localMock?: LocalMockRuntime;

	constructor(transport: Transport, resolver?: SubAccountResolver, localMock?: LocalMockRuntime) {
		this.#client = createClient(Proto.ApiKeyService, transport);
		this.#resolver = resolver;
		this.#localMock = localMock;
	}

	async list(params: z.input<typeof ApiKeysListInputSchema> = {}): Promise<ApiKey[]> {
		const resolved = resolveSubAccountScopedInput(params, this.#resolver);
		if (this.#localMock?.isEnabled()) return [];
		const validatedParams = ApiKeysListInputSchema.parse(resolved);
		const res = await this.#client.listApiKeys(removeUndefined(validatedParams));

		return ApiKeysSchema.parse(res.apiKeys);
	}

	async get(keyId: string): Promise<ApiKey | null> {
		const validatedKeyId = keyId.trim();
		if (!validatedKeyId) throw new Error("[PolyesterClient.apiKeys.get]: keyId is required");
		if (this.#localMock?.isEnabled()) return null;
		const res = await this.#client.getApiKey({ keyId: validatedKeyId });
		return res.apiKey ? ApiKeySchema.parse(res.apiKey) : null;
	}

	/**
	 * Create an API key. Some environments require MFA fresh step-up: on failure, complete an MFA
	 * challenge with purpose `freshStepUp` via `client.mfa`, then retry with `stepUpToken` in options.
	 */
	// TODO: get with Yvan about why this possibly returns undefined
	async create(
		payload: z.input<typeof ApiKeysCreateInputSchema>,
		options?: ApiKeysMutationOptions
	): Promise<ApiKey | null> {
		this.#localMock?.assertMutationAllowed("apiKeys.create");
		const resolved = resolveSubAccountScopedInput(payload, this.#resolver);
		const validatedPayload = ApiKeysCreateInputSchema.parse(resolved);
		const res = await this.#client.createApiKey(
			removeUndefined(validatedPayload),
			stepUpCallOptions(options?.stepUpToken)
		);
		return res.apiKey ? ApiKeySchema.parse(res.apiKey) : null;
	}

	async delete(keyId: string, options?: ApiKeysMutationOptions): Promise<void> {
		this.#localMock?.assertMutationAllowed("apiKeys.delete");
		const validatedKeyId = keyId.trim();
		if (!validatedKeyId) throw new Error("[PolyesterClient.apiKeys.delete]: keyId is required");
		await this.#client.deleteApiKey(
			{ keyId: validatedKeyId },
			stepUpCallOptions(options?.stepUpToken)
		);
	}

	// TODO: get with Yvan about why this possibly returns undefined
	async update(
		payload: z.input<typeof ApiKeysUpdateInputSchema>,
		options?: ApiKeysMutationOptions
	): Promise<ApiKey | null> {
		this.#localMock?.assertMutationAllowed("apiKeys.update");
		const validatedPayload = ApiKeysUpdateInputSchema.parse(payload);
		const res = await this.#client.updateApiKey(
			removeUndefined(validatedPayload),
			stepUpCallOptions(options?.stepUpToken)
		);
		return res.apiKey ? ApiKeySchema.parse(res.apiKey) : null;
	}

	/**
	 * Generates a new Ed25519 keypair on the client.
	 * The public key is used to create a new API key on the server.
	 * @returns The public and secret key bytes in hex and bytes format.
	 */
	async generateKeypair(): Promise<{
		publicKey: { hex: string; bytes: Uint8Array };
		secretKey: { hex: string; bytes: Uint8Array };
	}> {
		const { secretKey, publicKey } = await keygenAsync();
		return {
			publicKey: {
				hex: bytesToHex(publicKey),
				bytes: publicKey,
			},
			secretKey: {
				hex: bytesToHex(secretKey),
				bytes: secretKey,
			},
		};
	}

	subscribe(input: SubscribeApiKeysInput) {
		if (this.#localMock?.isEnabled()) {
			return createLocalMockNoopSubscription(input);
		}
		const channel = `private:auth:api-keys:${input.accountId}:proto`;

		return connectProtoChannel({
			channel,
			schema: Proto.ApiKeySchema,
			onPublication: (data) => {
				const apiKey = ApiKeySchema.parse(data);
				input.onEvent(apiKey);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
		});
	}
}
