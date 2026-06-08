import * as Proto from "../../../gen/auth/v1/policies_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { removeUndefined } from "../../../utils/remove-undefined.js";
import { idToBigInt } from "../../../utils/base58-id.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../../shared/request-options.js";
import {
    ApiKeyPolicySchema,
    ListApiKeyPoliciesResponseSchema,
    CreateApiKeyPolicyInputSchema,
    UpdateApiKeyPolicyInputSchema,
    ApplyApiKeyPolicyInputSchema,
    DEFAULT_API_KEY_POLICY,
    type ApiKeyPolicy,
} from "./api-key-policies.schemas.js";
import { PolicyIdSchema } from "../shared.js";

/**
 * Manages reusable API key policy templates and their assignment to API keys.
 */
export class ApiKeyPoliciesService {
    #client: Client<typeof Proto.PolicyService>;

    constructor(transport: Transport) {
        this.#client = createClient(Proto.PolicyService, transport);
    }

    /**
     * Returns API key policy templates available to the caller.
     */
    async list(options?: PolyesterRequestOptions): Promise<ApiKeyPolicy[]> {
        const res = await this.#client.listApiPolicies({}, toConnectCallOptions(options));
        return v.parse(ListApiKeyPoliciesResponseSchema, res);
    }

    /**
     * Fetches an API key policy by base58 policy ID, falling back to the SDK default no-permissions policy when no ID or policy is returned.
     */
    async get(
        policyId: string | undefined,
        options?: PolyesterRequestOptions,
    ): Promise<ApiKeyPolicy> {
        if (!policyId) return DEFAULT_API_KEY_POLICY;
        const res = await this.#client.getApiPolicy(
            { policyId: idToBigInt(policyId, "policyId") },
            toConnectCallOptions(options),
        );
        if (!res.policy) return DEFAULT_API_KEY_POLICY;
        return v.parse(ApiKeyPolicySchema, res.policy);
    }

    /**
     * Creates an API key policy template with market scopes, allowed actions, notional/transfer limits, and optional immediate assignment to a key.
     */
    async create(
        input: v.InferInput<typeof CreateApiKeyPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<ApiKeyPolicy> {
        const validatedInput = v.parse(CreateApiKeyPolicyInputSchema, input);
        const res = await this.#client.createApiPolicy(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!res.policy) throw new Error("Failed to create API key policy");
        return v.parse(ApiKeyPolicySchema, res.policy);
    }

    /**
     * Replaces an existing API key policy template using the supplied market, action, and limit settings.
     */
    async update(
        input: v.InferInput<typeof UpdateApiKeyPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<ApiKeyPolicy> {
        const validatedInput = v.parse(UpdateApiKeyPolicyInputSchema, input);
        const res = await this.#client.updateApiPolicy(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!res.policy) throw new Error("Failed to update API key policy");
        return v.parse(ApiKeyPolicySchema, res.policy);
    }

    /**
     * Deletes an API key policy template when it is not in use.
     */
    async delete(policyId: string, options?: PolyesterMutationOptions): Promise<void> {
        const validatedPolicyId = v.parse(PolicyIdSchema, policyId);
        await this.#client.deleteApiPolicy(
            { policyId: validatedPolicyId },
            toConnectCallOptions(options),
        );
    }

    /**
     * Attaches a policy to an API key, or clears the key-specific policy when policyId is null.
     */
    async apply(
        input: v.InferInput<typeof ApplyApiKeyPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const validatedInput = v.parse(ApplyApiKeyPolicyInputSchema, input);
        await this.#client.setApiKeyPolicy(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
    }
}
