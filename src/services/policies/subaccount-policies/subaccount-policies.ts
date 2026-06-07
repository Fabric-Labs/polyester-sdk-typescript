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

    async list(options?: PolyesterRequestOptions): Promise<SubaccountPolicy[]> {
        const result = await this.#client.listSubaccountPolicies({}, toConnectCallOptions(options));
        return v.parse(v.array(SubaccountPolicySchema), result.policies);
    }

    async get(
        policyId: string,
        options?: PolyesterRequestOptions,
    ): Promise<SubaccountPolicy | null> {
        const result = await this.#client.getSubaccountPolicy(
            {
                policyId: idToBigInt(policyId, "policyId"),
            },
            toConnectCallOptions(options),
        );
        if (!result.policy) return null;
        return v.parse(SubaccountPolicySchema, result.policy);
    }

    async create(
        input: v.InferInput<typeof CreateSubaccountPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountPolicy | null> {
        const validatedInput = v.parse(CreateSubaccountPolicyInputSchema, input);
        const result = await this.#client.createSubaccountPolicy(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!result.policy) throw new Error("Failed to create subaccount policy");
        return v.parse(SubaccountPolicySchema, result.policy);
    }

    async update(
        input: v.InferInput<typeof UpdateSubaccountPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountPolicy | null> {
        const validatedInput = v.parse(UpdateSubaccountPolicyInputSchema, input);
        const result = await this.#client.updateSubaccountPolicy(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!result.policy) throw new Error("Failed to update subaccount policy");
        return v.parse(SubaccountPolicySchema, result.policy);
    }

    async delete(policyId: string, options?: PolyesterMutationOptions): Promise<void> {
        const validatedPolicyId = v.parse(PolicyIdSchema, policyId);
        await this.#client.deleteSubaccountPolicy(
            { policyId: validatedPolicyId },
            toConnectCallOptions(options),
        );
    }

    async apply(
        input: v.InferInput<typeof ApplySubaccountPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const validatedInput = v.parse(ApplySubaccountPolicyInputSchema, input);
        await this.#client.setSubaccountPolicy(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
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
