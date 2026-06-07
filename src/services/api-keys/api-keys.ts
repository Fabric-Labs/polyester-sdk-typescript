import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import * as v from "valibot";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { keygenAsync } from "@noble/ed25519";
import type { RealtimeClient } from "../../realtime/index.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { ApiKeyPoliciesService } from "../policies/api-key-policies/index.js";
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

export class ApiKeysService {
    readonly policies: ApiKeyPoliciesService;

    #client: Client<typeof Proto.ApiKeyService>;
    #realtime: RealtimeClient;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, realtime: RealtimeClient, resolver?: SubaccountResolver) {
        this.policies = new ApiKeyPoliciesService(transport);
        this.#client = createClient(Proto.ApiKeyService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    async list(
        params: v.InferInput<typeof ApiKeysListInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<ApiKey[]> {
        const resolved = resolveSubaccountScopedInput(params, this.#resolver);
        const validatedParams = v.parse(ApiKeysListInputSchema, resolved);
        const res = await this.#client.listApiKeys(
            removeUndefined(validatedParams),
            toConnectCallOptions(options),
        );

        return v.parse(ApiKeysSchema, res.apiKeys);
    }

    async get(keyId: string, options?: PolyesterRequestOptions): Promise<ApiKey | null> {
        const validatedKeyId = keyId.trim();
        if (!validatedKeyId) throw new Error("[PolyesterClient.apiKeys.get]: keyId is required");
        const res = await this.#client.getApiKey(
            { keyId: validatedKeyId },
            toConnectCallOptions(options),
        );
        return res.apiKey ? v.parse(ApiKeySchema, res.apiKey) : null;
    }

    /**
     * Create an API key. Some environments require MFA fresh step-up: on failure, complete an MFA
     * challenge with purpose `freshStepUp` via `client.mfa`, then retry with `stepUpToken` in options.
     */
    async create(
        payload: v.InferInput<typeof ApiKeysCreateInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<ApiKey | null> {
        const resolved = resolveSubaccountScopedInput(payload, this.#resolver);
        const validatedPayload = v.parse(ApiKeysCreateInputSchema, resolved);
        const res = await this.#client.createApiKey(
            removeUndefined(validatedPayload),
            toConnectCallOptions(options),
        );
        return res.apiKey ? v.parse(ApiKeySchema, res.apiKey) : null;
    }

    async delete(keyId: string, options?: PolyesterMutationOptions): Promise<void> {
        const validatedKeyId = keyId.trim();
        if (!validatedKeyId) throw new Error("[PolyesterClient.apiKeys.delete]: keyId is required");
        await this.#client.deleteApiKey({ keyId: validatedKeyId }, toConnectCallOptions(options));
    }

    async update(
        payload: v.InferInput<typeof ApiKeysUpdateInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<ApiKey | null> {
        const validatedPayload = v.parse(ApiKeysUpdateInputSchema, payload);
        const res = await this.#client.updateApiKey(
            removeUndefined(validatedPayload),
            toConnectCallOptions(options),
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
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
