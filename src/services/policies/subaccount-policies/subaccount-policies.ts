import * as Proto from "../../../gen/auth/v1/policies_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { removeUndefined } from "../../../utils/remove-undefined.js";
import { idToBigInt } from "../../../utils/base58-id.js";
import type { BaseSubscribeInput } from "../../../shared/types.js";
import type { RealtimeClient } from "../../../realtime/index.js";
import {
    SubaccountPolicySchema,
    CreateSubaccountPolicyInputSchema,
    UpdateSubaccountPolicyInputSchema,
    PolicyIdSchema,
    ApplySubaccountPolicyInputSchema,
    type SubaccountPolicy,
} from "./subaccount-policies.schemas.js";

interface SubscribePoliciesInput extends BaseSubscribeInput<SubaccountPolicy> {
    accountId: string;
}

export class SubaccountPoliciesService {
    #client: Client<typeof Proto.PolicyService>;
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(Proto.PolicyService, transport);
        this.#realtime = realtime;
    }

    async list(): Promise<SubaccountPolicy[]> {
        const result = await this.#client.listSubaccountPolicies({});
        return v.parse(v.array(SubaccountPolicySchema), result.policies);
    }

    async get(policyId: string): Promise<SubaccountPolicy | null> {
        const result = await this.#client.getSubaccountPolicy({
            policyId: idToBigInt(policyId, "policyId"),
        });
        if (!result.policy) return null;
        return v.parse(SubaccountPolicySchema, result.policy);
    }

    async create(
        input: v.InferInput<typeof CreateSubaccountPolicyInputSchema>,
    ): Promise<SubaccountPolicy | null> {
        const validatedInput = v.parse(CreateSubaccountPolicyInputSchema, input);
        const result = await this.#client.createSubaccountPolicy(removeUndefined(validatedInput));
        if (!result.policy) throw new Error("Failed to create subaccount policy");
        return v.parse(SubaccountPolicySchema, result.policy);
    }

    async update(
        input: v.InferInput<typeof UpdateSubaccountPolicyInputSchema>,
    ): Promise<SubaccountPolicy | null> {
        const validatedInput = v.parse(UpdateSubaccountPolicyInputSchema, input);
        const result = await this.#client.updateSubaccountPolicy(removeUndefined(validatedInput));
        if (!result.policy) throw new Error("Failed to update subaccount policy");
        return v.parse(SubaccountPolicySchema, result.policy);
    }

    async delete(policyId: string): Promise<void> {
        const validatedPolicyId = v.parse(PolicyIdSchema, policyId);
        await this.#client.deleteSubaccountPolicy({ policyId: validatedPolicyId });
    }

    async apply(input: v.InferInput<typeof ApplySubaccountPolicyInputSchema>): Promise<void> {
        const validatedInput = v.parse(ApplySubaccountPolicyInputSchema, input);
        await this.#client.setSubaccountPolicy(removeUndefined(validatedInput));
    }

    subscribePolicies(input: SubscribePoliciesInput) {
        const channel = `private:auth:subaccount-policies:${input.accountId}:proto`;

        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.SubaccountPolicyViewSchema,
            onPublication: (data) => {
                const policy = v.parse(SubaccountPolicySchema, data);
                input.onEvent(policy);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
