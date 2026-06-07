import * as Proto from "../../../gen/auth/v1/policies_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { removeUndefined } from "../../../utils/remove-undefined.js";
import { idToBigInt } from "../../../utils/base58-id.js";
import { stepUpCallOptions } from "../../../utils/step-up-call-options.js";
import {
    ApiKeyPolicySchema,
    CreateApiKeyPolicyInputSchema,
    UpdateApiKeyPolicyInputSchema,
    ApplyApiKeyPolicyInputSchema,
    DEFAULT_API_KEY_POLICY,
    type ApiKeyPolicy,
} from "./api-key-policies.schemas.js";
import { PolicyIdSchema } from "../shared.js";

/** Optional fresh step-up token from {@link MfaService} after `freshStepUp` challenge completion. */
export type ApiKeyPoliciesMutationOptions = {
    stepUpToken?: string | null;
};

export class ApiKeyPoliciesService {
    #client: Client<typeof Proto.PolicyService>;

    constructor(transport: Transport) {
        this.#client = createClient(Proto.PolicyService, transport);
    }

    async list(): Promise<Proto.ListApiPoliciesResponse> {
        return this.#client.listApiPolicies({});
    }

    async get(policyId: string | undefined): Promise<ApiKeyPolicy> {
        if (!policyId) return DEFAULT_API_KEY_POLICY;
        const res = await this.#client.getApiPolicy({ policyId: idToBigInt(policyId, "policyId") });
        if (!res.policy) return DEFAULT_API_KEY_POLICY;
        return v.parse(ApiKeyPolicySchema, res.policy);
    }

    async create(
        input: v.InferInput<typeof CreateApiKeyPolicyInputSchema>,
        options?: ApiKeyPoliciesMutationOptions,
    ): Promise<ApiKeyPolicy> {
        const validatedInput = v.parse(CreateApiKeyPolicyInputSchema, input);
        const res = await this.#client.createApiPolicy(
            removeUndefined(validatedInput),
            stepUpCallOptions(options?.stepUpToken),
        );
        if (!res.policy) throw new Error("Failed to create API key policy");
        return v.parse(ApiKeyPolicySchema, res.policy);
    }

    async update(
        input: v.InferInput<typeof UpdateApiKeyPolicyInputSchema>,
        options?: ApiKeyPoliciesMutationOptions,
    ): Promise<ApiKeyPolicy> {
        const validatedInput = v.parse(UpdateApiKeyPolicyInputSchema, input);
        const res = await this.#client.updateApiPolicy(
            removeUndefined(validatedInput),
            stepUpCallOptions(options?.stepUpToken),
        );
        if (!res.policy) throw new Error("Failed to update API key policy");
        return v.parse(ApiKeyPolicySchema, res.policy);
    }

    async delete(policyId: string, options?: ApiKeyPoliciesMutationOptions): Promise<void> {
        const validatedPolicyId = v.parse(PolicyIdSchema, policyId);
        await this.#client.deleteApiPolicy(
            { policyId: validatedPolicyId },
            stepUpCallOptions(options?.stepUpToken),
        );
    }

    async apply(
        input: v.InferInput<typeof ApplyApiKeyPolicyInputSchema>,
        options?: ApiKeyPoliciesMutationOptions,
    ): Promise<void> {
        const validatedInput = v.parse(ApplyApiKeyPolicyInputSchema, input);
        await this.#client.setApiKeyPolicy(
            removeUndefined(validatedInput),
            stepUpCallOptions(options?.stepUpToken),
        );
    }
}
