import { create } from "@bufbuild/protobuf";
import * as Proto from "../../../gen/auth/v1/policies_pb";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import { removeUndefined } from "../../../utils/remove-undefined";
import { idToBigInt } from "../../../utils/base58-id";
import { stepUpCallOptions } from "../../../utils/step-up-call-options";
import {
	ApiKeyPolicySchema,
	CreateApiKeyPolicyInputSchema,
	UpdateApiKeyPolicyInputSchema,
	ApplyApiKeyPolicyInputSchema,
	DEFAULT_API_KEY_POLICY,
	type ApiKeyPolicy,
} from "./api-key-policies.schemas";
import { PolicyIdSchema } from "../shared";
import type { LocalMockRuntime } from "../../../mock/local-mock-runtime";

/** Optional fresh step-up token from {@link MfaService} after `freshStepUp` challenge completion. */
export type ApiKeyPoliciesMutationOptions = {
	stepUpToken?: string | null;
};

export class ApiKeyPoliciesService {
	#client: Client<typeof Proto.PolicyService>;
	#localMock?: LocalMockRuntime;

	constructor(transport: Transport, localMock?: LocalMockRuntime) {
		this.#client = createClient(Proto.PolicyService, transport);
		this.#localMock = localMock;
	}

	async list(): Promise<Proto.ListApiPoliciesResponse> {
		if (this.#localMock?.isEnabled()) {
			return create(Proto.ListApiPoliciesResponseSchema, { policies: [] });
		}
		return this.#client.listApiPolicies({});
	}

	async get(policyId: string | undefined): Promise<ApiKeyPolicy> {
		if (!policyId) return DEFAULT_API_KEY_POLICY;
		if (this.#localMock?.isEnabled()) return DEFAULT_API_KEY_POLICY;
		const res = await this.#client.getApiPolicy({ policyId: idToBigInt(policyId, "policyId") });
		if (!res.policy) return DEFAULT_API_KEY_POLICY;
		return ApiKeyPolicySchema.parse(res.policy);
	}

	async create(
		input: z.input<typeof CreateApiKeyPolicyInputSchema>,
		options?: ApiKeyPoliciesMutationOptions
	): Promise<ApiKeyPolicy> {
		this.#localMock?.assertMutationAllowed("policies.apiKey.create");
		const validatedInput = CreateApiKeyPolicyInputSchema.parse(input);
		const res = await this.#client.createApiPolicy(
			removeUndefined(validatedInput),
			stepUpCallOptions(options?.stepUpToken)
		);
		if (!res.policy) throw new Error("Failed to create API key policy");
		return ApiKeyPolicySchema.parse(res.policy);
	}

	async update(
		input: z.input<typeof UpdateApiKeyPolicyInputSchema>,
		options?: ApiKeyPoliciesMutationOptions
	): Promise<ApiKeyPolicy> {
		this.#localMock?.assertMutationAllowed("policies.apiKey.update");
		const validatedInput = UpdateApiKeyPolicyInputSchema.parse(input);
		const res = await this.#client.updateApiPolicy(
			removeUndefined(validatedInput),
			stepUpCallOptions(options?.stepUpToken)
		);
		if (!res.policy) throw new Error("Failed to update API key policy");
		return ApiKeyPolicySchema.parse(res.policy);
	}

	async delete(policyId: string, options?: ApiKeyPoliciesMutationOptions): Promise<void> {
		this.#localMock?.assertMutationAllowed("policies.apiKey.delete");
		const validatedPolicyId = PolicyIdSchema.parse(policyId);
		await this.#client.deleteApiPolicy(
			{ policyId: validatedPolicyId },
			stepUpCallOptions(options?.stepUpToken)
		);
	}

	async apply(
		input: z.input<typeof ApplyApiKeyPolicyInputSchema>,
		options?: ApiKeyPoliciesMutationOptions
	): Promise<void> {
		this.#localMock?.assertMutationAllowed("policies.apiKey.apply");
		const validatedInput = ApplyApiKeyPolicyInputSchema.parse(input);
		await this.#client.setApiKeyPolicy(
			removeUndefined(validatedInput),
			stepUpCallOptions(options?.stepUpToken)
		);
	}
}
