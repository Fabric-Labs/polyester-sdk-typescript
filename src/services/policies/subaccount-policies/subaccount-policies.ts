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

/**
 * Manages reusable subaccount policy templates, assignments, and realtime policy updates.
 */
export class SubaccountPoliciesService {
    #client: Client<typeof Proto.PolicyService>;
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(Proto.PolicyService, transport);
        this.#realtime = realtime;
    }

    /**
     * Returns subaccount policy templates visible to the caller, sorted by ascending policy ID.
     */
    async list(options?: PolyesterRequestOptions): Promise<SubaccountPolicy[]> {
        const result = await this.#client.listSubaccountPolicies({}, toConnectCallOptions(options));
        return v.parse(v.array(SubaccountPolicySchema), result.policies);
    }

    /**
     * Fetches one subaccount policy template by base58 policy ID and returns null when no policy is returned.
     */
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

    /**
     * Creates a subaccount policy template, optionally attaching it to a target subaccount in the same request.
     */
    async create(
        input: v.InferInput<typeof CreateSubaccountPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountPolicy> {
        const validatedInput = v.parse(CreateSubaccountPolicyInputSchema, input);
        const result = await this.#client.createSubaccountPolicy(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!result.policy) throw new Error("Failed to create subaccount policy");
        return v.parse(SubaccountPolicySchema, result.policy);
    }

    /**
     * Replaces an existing subaccount policy template with supplied market scopes, allowed actions, exposure limits, transfer rules, and safety controls.
     */
    async update(
        input: v.InferInput<typeof UpdateSubaccountPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountPolicy> {
        const validatedInput = v.parse(UpdateSubaccountPolicyInputSchema, input);
        const result = await this.#client.updateSubaccountPolicy(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!result.policy) throw new Error("Failed to update subaccount policy");
        return v.parse(SubaccountPolicySchema, result.policy);
    }

    /**
     * Deletes a subaccount policy template when it is not in use.
     */
    async delete(policyId: string, options?: PolyesterMutationOptions): Promise<void> {
        const validatedPolicyId = v.parse(PolicyIdSchema, policyId);
        await this.#client.deleteSubaccountPolicy(
            { policyId: validatedPolicyId },
            toConnectCallOptions(options),
        );
    }

    /**
     * Attaches a policy to a subaccount, or clears the subaccount-specific policy when policyId is null.
     */
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

    /**
     * Subscribes to private subaccount policy updates for an account and emits normalized policy views.
     */
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
