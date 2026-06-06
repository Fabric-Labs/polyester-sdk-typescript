import * as Proto from "../../../gen/auth/v1/policies_pb";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import { removeUndefined } from "../../../utils/remove-undefined";
import { idToBigInt } from "../../../utils/base58-id";
import type { BaseSubscribeInput } from "../../../shared/types";
import { connectProtoChannel } from "../../../realtime";
import {
	SubAccountPolicySchema,
	CreateSubAccountPolicyInputSchema,
	UpdateSubAccountPolicyInputSchema,
	PolicyIdSchema,
	ApplySubAccountPolicyInputSchema,
	type SubAccountPolicy,
} from "./sub-account-policies.schemas";
import { createLocalMockNoopSubscription } from "../../../mock/local-mock-subscription";
import type { LocalMockRuntime } from "../../../mock/local-mock-runtime";

interface SubscribePoliciesInput extends BaseSubscribeInput<SubAccountPolicy> {
	accountId: string;
}

export class SubAccountPoliciesService {
	#client: Client<typeof Proto.PolicyService>;
	#localMock?: LocalMockRuntime;

	constructor(transport: Transport, localMock?: LocalMockRuntime) {
		this.#client = createClient(Proto.PolicyService, transport);
		this.#localMock = localMock;
	}

	async list(): Promise<SubAccountPolicy[]> {
		if (this.#localMock?.isEnabled()) return [];
		const result = await this.#client.listSubaccountPolicies({});
		return z.array(SubAccountPolicySchema).parse(result.policies);
	}

	async get(policyId: string): Promise<SubAccountPolicy | null> {
		if (this.#localMock?.isEnabled()) return null;
		const result = await this.#client.getSubaccountPolicy({
			policyId: idToBigInt(policyId, "policyId"),
		});
		if (!result.policy) return null;
		return SubAccountPolicySchema.parse(result.policy);
	}

	async create(
		input: z.input<typeof CreateSubAccountPolicyInputSchema>
	): Promise<SubAccountPolicy | null> {
		this.#localMock?.assertMutationAllowed("policies.subaccount.create");
		const validatedInput = CreateSubAccountPolicyInputSchema.parse(input);
		const result = await this.#client.createSubaccountPolicy(removeUndefined(validatedInput));
		if (!result.policy) throw new Error("Failed to create subaccount policy");
		return SubAccountPolicySchema.parse(result.policy);
	}

	async update(
		input: z.input<typeof UpdateSubAccountPolicyInputSchema>
	): Promise<SubAccountPolicy | null> {
		this.#localMock?.assertMutationAllowed("policies.subaccount.update");
		const validatedInput = UpdateSubAccountPolicyInputSchema.parse(input);
		const result = await this.#client.updateSubaccountPolicy(removeUndefined(validatedInput));
		if (!result.policy) throw new Error("Failed to update subaccount policy");
		return SubAccountPolicySchema.parse(result.policy);
	}

	async delete(policyId: string): Promise<void> {
		this.#localMock?.assertMutationAllowed("policies.subaccount.delete");
		const validatedPolicyId = PolicyIdSchema.parse(policyId);
		await this.#client.deleteSubaccountPolicy({ policyId: validatedPolicyId });
	}

	async apply(input: z.input<typeof ApplySubAccountPolicyInputSchema>): Promise<void> {
		this.#localMock?.assertMutationAllowed("policies.subaccount.apply");
		const validatedInput = ApplySubAccountPolicyInputSchema.parse(input);
		await this.#client.setSubaccountPolicy(removeUndefined(validatedInput));
	}

	subscribePolicies(input: SubscribePoliciesInput) {
		if (this.#localMock?.isEnabled()) {
			return createLocalMockNoopSubscription(input);
		}
		const channel = `private:auth:subaccount-policies:${input.accountId}:proto`;

		return connectProtoChannel({
			channel,
			schema: Proto.SubaccountPolicyViewSchema,
			onPublication: (data) => {
				const policy = SubAccountPolicySchema.parse(data);
				input.onEvent(policy);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
		});
	}
}
