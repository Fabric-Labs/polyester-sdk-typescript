import * as Proto from "../../../gen/auth/v1/policies_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import { removeUndefined } from "../../../utils/remove-undefined.js";
import { idToBigInt } from "../../../utils/base58-id.js";
import type { BaseSubscribeInput } from "../../../shared/types.js";
import { connectProtoChannel } from "../../../realtime/index.js";
import {
	SubAccountPolicySchema,
	CreateSubAccountPolicyInputSchema,
	UpdateSubAccountPolicyInputSchema,
	PolicyIdSchema,
	ApplySubAccountPolicyInputSchema,
	type SubAccountPolicy,
} from "./sub-account-policies.schemas.js";

interface SubscribePoliciesInput extends BaseSubscribeInput<SubAccountPolicy> {
	accountId: string;
}

export class SubAccountPoliciesService {
	#client: Client<typeof Proto.PolicyService>;

	constructor(transport: Transport) {
		this.#client = createClient(Proto.PolicyService, transport);
	}

	async list(): Promise<SubAccountPolicy[]> {
		const result = await this.#client.listSubaccountPolicies({});
		return z.array(SubAccountPolicySchema).parse(result.policies);
	}

	async get(policyId: string): Promise<SubAccountPolicy | null> {
		const result = await this.#client.getSubaccountPolicy({
			policyId: idToBigInt(policyId, "policyId"),
		});
		if (!result.policy) return null;
		return SubAccountPolicySchema.parse(result.policy);
	}

	async create(
		input: z.input<typeof CreateSubAccountPolicyInputSchema>
	): Promise<SubAccountPolicy | null> {
		const validatedInput = CreateSubAccountPolicyInputSchema.parse(input);
		const result = await this.#client.createSubaccountPolicy(removeUndefined(validatedInput));
		if (!result.policy) throw new Error("Failed to create subaccount policy");
		return SubAccountPolicySchema.parse(result.policy);
	}

	async update(
		input: z.input<typeof UpdateSubAccountPolicyInputSchema>
	): Promise<SubAccountPolicy | null> {
		const validatedInput = UpdateSubAccountPolicyInputSchema.parse(input);
		const result = await this.#client.updateSubaccountPolicy(removeUndefined(validatedInput));
		if (!result.policy) throw new Error("Failed to update subaccount policy");
		return SubAccountPolicySchema.parse(result.policy);
	}

	async delete(policyId: string): Promise<void> {
		const validatedPolicyId = PolicyIdSchema.parse(policyId);
		await this.#client.deleteSubaccountPolicy({ policyId: validatedPolicyId });
	}

	async apply(input: z.input<typeof ApplySubAccountPolicyInputSchema>): Promise<void> {
		const validatedInput = ApplySubAccountPolicyInputSchema.parse(input);
		await this.#client.setSubaccountPolicy(removeUndefined(validatedInput));
	}

	subscribePolicies(input: SubscribePoliciesInput) {
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
