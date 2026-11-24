import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import type * as v from "valibot";
import { parse } from "../../shared/validation.js";
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
    SetAssistantKeysInputSchema,
    SetStrategyBotAccessInputSchema,
    EndStrategyBotAccessInputSchema,
    StrategyBotAccessSchema,
    type ApiKey,
    type EndStrategyBotAccessInput,
    type SetAssistantKeysInput,
    type SetStrategyBotAccessInput,
    type StrategyBotAccess,
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

    constructor(
        transports: AuthApiTransports,
        realtime: PolyesterRealtime,
        resolver?: SubaccountResolver,
    ) {
        this.policies = new ApiKeyPoliciesService(transports);
        this.#client = createClient(Proto.ApiKeyService, transports.authApi);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    /**
     * Returns non-revoked API keys owned by the caller, newest first, optionally scoped through an explicit or resolver-provided subaccount ID. API keys need `read-api-keys`; a key scoped to a sub-account sees only that sub-account's keys.
     */
    async list(
        params: v.InferInput<typeof ApiKeysListInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<ApiKey[]> {
        const resolved = resolveAccountScopedInput(params, this.#resolver);
        const validatedParams = parse(ApiKeysListInputSchema, resolved);
        const res = await this.#client.listApiKeys(
            removeUndefined(validatedParams),
            toConnectCallOptions(options),
        );

        return parse(ApiKeysSchema, res.apiKeys);
    }

    /**
     * Fetches one caller-owned API key by ak_... key ID and returns null when no matching key is returned. API keys need `read-api-keys`.
     */
    async get(
        input: v.InferInput<typeof ApiKeyIdInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<ApiKey | null> {
        const validatedInput = parse(ApiKeyIdInputSchema, input);
        const res = await this.#client.getApiKey(validatedInput, toConnectCallOptions(options));
        return res.apiKey ? parse(ApiKeySchema, res.apiKey) : null;
    }

    /**
     * Creates API key metadata using a client-generated Ed25519 public key; security settings may require MFA fresh step-up and retrying with stepUpToken.
     */
    async create(
        payload: v.InferInput<typeof ApiKeysCreateInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<ApiKey | null> {
        const resolved = resolveAccountScopedInput(payload, this.#resolver);
        const validatedPayload = parse(ApiKeysCreateInputSchema, resolved);
        const res = await this.#client.createApiKey(
            removeUndefined(validatedPayload),
            toConnectCallOptions(options),
        );
        return res.apiKey ? parse(ApiKeySchema, res.apiKey) : null;
    }

    /**
     * Permanently revokes the specified API key; revoked keys cannot authenticate again.
     */
    async delete(
        input: v.InferInput<typeof ApiKeyIdInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const validatedInput = parse(ApiKeyIdInputSchema, input);
        await this.#client.deleteApiKey(validatedInput, toConnectCallOptions(options));
    }

    /**
     * Updates mutable key metadata, ACTIVE/DISABLED status, IP whitelist replacement/clearing, and optional expiry; revocation must use delete.
     */
    async update(
        payload: v.InferInput<typeof ApiKeysUpdateInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<ApiKey | null> {
        const validatedPayload = parse(ApiKeysUpdateInputSchema, payload);
        const res = await this.#client.updateApiKey(
            removeUndefined(validatedPayload),
            toConnectCallOptions(options),
        );
        return res.apiKey ? parse(ApiKeySchema, res.apiKey) : null;
    }

    /**
     * Replaces the caller's Polyester AI assistant key set: one `assistant` key per account,
     * each bounded by its API policy or a permission `preset`, all or nothing. Register the keys `assistant.prepareKeys`
     * returned before their deadline, then call `assistant.completeKeys`. Needs a fresh
     * `stepUpToken` for the whole set, including the policies its presets create. A policy that allows moving value out throws
     * `PreconditionFailedError` (`AUTH_ASSISTANT_KEY_ACTION_NOT_ALLOWED`).
     */
    async setAssistantKeys(
        input: SetAssistantKeysInput,
        options?: PolyesterMutationOptions,
    ): Promise<ApiKey[]> {
        const request = parse(SetAssistantKeysInputSchema, input);
        const res = await this.#client.setAssistantKeys(
            { keys: request.keys.map((key) => removeUndefined(key)) },
            toConnectCallOptions(options),
        );
        return parse(ApiKeysSchema, res.apiKeys);
    }

    /** Lists the caller's non-revoked assistant keys, newest first. */
    async listAssistantKeys(options?: PolyesterRequestOptions): Promise<ApiKey[]> {
        const res = await this.#client.listAssistantKeys({}, toConnectCallOptions(options));
        return parse(ApiKeysSchema, res.apiKeys);
    }

    /**
     * Permanently revokes the caller's whole assistant key set; needs no step-up. Returns the
     * revoked key IDs, empty when the set was already empty.
     */
    async deleteAssistantKeys(options?: PolyesterMutationOptions): Promise<string[]> {
        const res = await this.#client.deleteAssistantKeys({}, toConnectCallOptions(options));
        return res.revokedKeyIds;
    }

    /**
     * Gives a strategy bot its trade key on its own sub-account, all or nothing: a sub-account
     * policy that allows spot trading only within `limits`, an API policy over the same markets
     * that also reads the sub-account's orders and balances, and a `strategy_bot` key bound to it.
     * Neither policy can move value out. Needs a session (API keys and connected apps are refused)
     * that is MFA-elevated or passes a fresh `stepUpToken`.
     *
     * The sub-account must be the caller's, active, not a QuickSwap broker vault, and have no
     * policy, live key, member or pending invite (`PreconditionFailedError`,
     * `AUTH_STRATEGY_BOT_SUBACCOUNT_INELIGIBLE`). Repeating the same request under the same
     * `deployOperationId` returns the same key and changes nothing, so it is safe to retry; a
     * different request under it, or one `endStrategyBotAccess` ended, throws `AlreadyExistsError`
     * (`AUTH_STRATEGY_BOT_OPERATION_CONFLICT`). Until access ends, the key, its policy and the
     * sub-account's policy, keys, members and invites can't be changed
     * (`AUTH_STRATEGY_BOT_MANAGED`).
     */
    async setStrategyBotAccess(
        input: SetStrategyBotAccessInput,
        options?: PolyesterMutationOptions,
    ): Promise<StrategyBotAccess> {
        const request = parse(SetStrategyBotAccessInputSchema, input);
        const res = await this.#client.setStrategyBotAccess(request, toConnectCallOptions(options));
        return parse(StrategyBotAccessSchema, res);
    }

    /**
     * Ends the access `setStrategyBotAccess` gave under `deployOperationId`: revokes the bot's key
     * and releases the sub-account. Returns the revoked key ID, or `null` when there was nothing to
     * end (never set, or already ended), so it is safe to retry. Needs a session but no step-up.
     * The sub-account keeps its policy, and the identifier stays ended: a later
     * `setStrategyBotAccess` under it throws `AlreadyExistsError`.
     */
    async endStrategyBotAccess(
        input: EndStrategyBotAccessInput,
        options?: PolyesterMutationOptions,
    ): Promise<string | null> {
        const request = parse(EndStrategyBotAccessInputSchema, input);
        const res = await this.#client.endStrategyBotAccess(request, toConnectCallOptions(options));
        return res.revokedKeyId || null;
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
                const apiKey = parse(ApiKeySchema, data);
                input.onEvent(apiKey);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: input.onError,
        });
    }
}
