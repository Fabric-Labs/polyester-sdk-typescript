import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import * as v from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { keygenAsync } from "@noble/ed25519";
import type { PolyesterRealtime } from "../../realtime/index.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { ApiKeyPoliciesService } from "../policies/api-key-policies/index.js";
import {
    ApiKeyIdInputSchema,
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

/**
 * Manages API key metadata, client-generated Ed25519 keypairs, policies, and realtime API key updates.
 */
export class ApiKeysService {
    readonly policies: ApiKeyPoliciesService;

    #client: Client<typeof Proto.ApiKeyService>;
    #realtime: PolyesterRealtime;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, realtime: PolyesterRealtime, resolver?: SubaccountResolver) {
        this.policies = new ApiKeyPoliciesService(transport);
        this.#client = createClient(Proto.ApiKeyService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    /**
     * Returns non-revoked API keys owned by the caller, newest first, optionally scoped through an explicit or resolver-provided subaccount ID.
     */
    async list(
        params: v.InferInput<typeof ApiKeysListInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<ApiKey[]> {
        const resolved = resolveAccountScopedInput(params, this.#resolver);
        const validatedParams = v.parse(ApiKeysListInputSchema, resolved);
        const res = await this.#client.listApiKeys(
            removeUndefined(validatedParams),
            toConnectCallOptions(options),
        );

        return v.parse(ApiKeysSchema, res.apiKeys);
    }

    /**
     * Fetches one caller-owned API key by ak_... key ID and returns null when no matching key is returned.
     */
    async get(
        input: v.InferInput<typeof ApiKeyIdInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<ApiKey | null> {
        const validatedInput = v.parse(ApiKeyIdInputSchema, input);
        const res = await this.#client.getApiKey(validatedInput, toConnectCallOptions(options));
        return res.apiKey ? v.parse(ApiKeySchema, res.apiKey) : null;
    }

    /**
     * Creates API key metadata using a client-generated Ed25519 public key; security settings may require MFA fresh step-up and retrying with stepUpToken.
     */
    async create(
        payload: v.InferInput<typeof ApiKeysCreateInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<ApiKey | null> {
        const resolved = resolveAccountScopedInput(payload, this.#resolver);
        const validatedPayload = v.parse(ApiKeysCreateInputSchema, resolved);
        const res = await this.#client.createApiKey(
            removeUndefined(validatedPayload),
            toConnectCallOptions(options),
        );
        return res.apiKey ? v.parse(ApiKeySchema, res.apiKey) : null;
    }

    /**
     * Permanently revokes the specified API key; revoked keys cannot authenticate again.
     */
    async delete(
        input: v.InferInput<typeof ApiKeyIdInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const validatedInput = v.parse(ApiKeyIdInputSchema, input);
        await this.#client.deleteApiKey(validatedInput, toConnectCallOptions(options));
    }

    /**
     * Updates mutable key metadata, ACTIVE/DISABLED status, IP whitelist replacement/clearing, and optional expiry; revocation must use delete.
     */
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
     * Generates an Ed25519 keypair locally and returns public and secret key material as both hex strings and byte arrays; only the public key should be sent to the API.
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

    /**
     * Subscribes to private API key updates for an account and emits normalized API key metadata from realtime protobuf publications.
     */
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
