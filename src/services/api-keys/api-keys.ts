import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import * as v from "valibot";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { stepUpCallOptions } from "../../utils/step-up-call-options.js";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { keygenAsync } from "@noble/ed25519";
import type { RealtimeClient } from "../../realtime/index.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    ApiKeysListInputSchema,
    ApiKeysCreateInputSchema,
    ApiKeysUpdateInputSchema,
    ApiKeySchema,
    ApiKeysSchema,
    type ApiKey,
} from "./api-keys.schemas.js";

interface SubscribeApiKeysInput extends BaseSubscribeInput<ApiKey> {
    accountId: string;
}

/** Optional fresh step-up token from {@link MfaService} after `freshStepUp` challenge completion. */
export type ApiKeysMutationOptions = {
    stepUpToken?: string | null;
};

export class ApiKeysService {
    #client: Client<typeof Proto.ApiKeyService>;
    #realtime: RealtimeClient;
    #resolver?: SubAccountResolver;

    constructor(transport: Transport, realtime: RealtimeClient, resolver?: SubAccountResolver) {
        this.#client = createClient(Proto.ApiKeyService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    async list(params: v.InferInput<typeof ApiKeysListInputSchema> = {}): Promise<ApiKey[]> {
        const resolved = resolveSubAccountScopedInput(params, this.#resolver);
        const validatedParams = v.parse(ApiKeysListInputSchema, resolved);
        const res = await this.#client.listApiKeys(removeUndefined(validatedParams));

        return v.parse(ApiKeysSchema, res.apiKeys);
    }

    async get(keyId: string): Promise<ApiKey | null> {
        const validatedKeyId = keyId.trim();
        if (!validatedKeyId) throw new Error("[PolyesterClient.apiKeys.get]: keyId is required");
        const res = await this.#client.getApiKey({ keyId: validatedKeyId });
        return res.apiKey ? v.parse(ApiKeySchema, res.apiKey) : null;
    }

    /**
     * Create an API key. Some environments require MFA fresh step-up: on failure, complete an MFA
     * challenge with purpose `freshStepUp` via `client.mfa`, then retry with `stepUpToken` in options.
     */
    // TODO: get with Yvan about why this possibly returns undefined
    async create(
        payload: v.InferInput<typeof ApiKeysCreateInputSchema>,
        options?: ApiKeysMutationOptions,
    ): Promise<ApiKey | null> {
        const resolved = resolveSubAccountScopedInput(payload, this.#resolver);
        const validatedPayload = v.parse(ApiKeysCreateInputSchema, resolved);
        const res = await this.#client.createApiKey(
            removeUndefined(validatedPayload),
            stepUpCallOptions(options?.stepUpToken),
        );
        return res.apiKey ? v.parse(ApiKeySchema, res.apiKey) : null;
    }

    async delete(keyId: string, options?: ApiKeysMutationOptions): Promise<void> {
        const validatedKeyId = keyId.trim();
        if (!validatedKeyId) throw new Error("[PolyesterClient.apiKeys.delete]: keyId is required");
        await this.#client.deleteApiKey(
            { keyId: validatedKeyId },
            stepUpCallOptions(options?.stepUpToken),
        );
    }

    // TODO: get with Yvan about why this possibly returns undefined
    async update(
        payload: v.InferInput<typeof ApiKeysUpdateInputSchema>,
        options?: ApiKeysMutationOptions,
    ): Promise<ApiKey | null> {
        const validatedPayload = v.parse(ApiKeysUpdateInputSchema, payload);
        const res = await this.#client.updateApiKey(
            removeUndefined(validatedPayload),
            stepUpCallOptions(options?.stepUpToken),
        );
        return res.apiKey ? v.parse(ApiKeySchema, res.apiKey) : null;
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
        const channel = `private:auth:api-keys:${input.accountId}:proto`;

        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.ApiKeySchema,
            onPublication: (data) => {
                const apiKey = v.parse(ApiKeySchema, data);
                input.onEvent(apiKey);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
        });
    }
}
