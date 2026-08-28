import * as Proto from "../../../gen/auth/v1/policies_pb.js";
import { createClient, type Client } from "@connectrpc/connect";
import * as v from "valibot";
import { parse } from "../../../shared/validation.js";
import { removeUndefined } from "../../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../../shared/request-options.js";
import type { BaseSubscribeInput } from "../../../shared/types.js";
import type { PolyesterRealtime } from "../../../realtime/index.js";
import type { AuthApiTransports } from "../../../shared/transports.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../../subaccount-resolver.js";
import {
    SubaccountPolicySchema,
    CreateSubaccountPolicyInputSchema,
    UpdateSubaccountPolicyInputSchema,
    PolicyIdSchema,
    ApplySubaccountPolicyInputSchema,
    type SubaccountPolicy,
    ListSubaccountPoliciesInputSchema,
    GetSubaccountPolicyInputSchema,
} from "./subaccount-policies.schemas.js";

interface SubscribePoliciesInput extends BaseSubscribeInput<SubaccountPolicy> {
    accountId: string;
}

/**
 * Manages reusable subaccount policy templates, assignments, and realtime policy updates.
 */
export class SubaccountPoliciesService {
    #client: Client<typeof Proto.PolicyService>;
    #realtime: PolyesterRealtime;
    #resolver?: SubaccountResolver;

    constructor(
        transports: AuthApiTransports,
        realtime: PolyesterRealtime,
        resolver?: SubaccountResolver,
    ) {
        this.#client = createClient(Proto.PolicyService, transports.authApi);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    /**
     * Returns subaccount policy templates visible to the caller, sorted by ascending policy ID.
     */
    async list(
        input: v.InferInput<typeof ListSubaccountPoliciesInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<SubaccountPolicy[]> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const request = parse(ListSubaccountPoliciesInputSchema, resolved);
        const result = await this.#client.listSubaccountPolicies(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(v.array(SubaccountPolicySchema), result.policies);
    }

    /**
     * Fetches one subaccount policy template by base58 policy ID and returns null when no policy is returned.
     */
    async get(
        input: v.InferInput<typeof GetSubaccountPolicyInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<SubaccountPolicy | null> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const request = parse(GetSubaccountPolicyInputSchema, resolved);
        const result = await this.#client.getSubaccountPolicy(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        if (!result.policy) return null;
        return parse(SubaccountPolicySchema, result.policy);
    }

    /**
     * Creates a subaccount policy template, optionally attaching it to a target subaccount in the same request.
     */
    async create(
        input: v.InferInput<typeof CreateSubaccountPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountPolicy> {
        const validatedInput = parse(CreateSubaccountPolicyInputSchema, input);
        const result = await this.#client.createSubaccountPolicy(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!result.policy) throw new Error("Failed to create subaccount policy");
        return parse(SubaccountPolicySchema, result.policy);
    }

    /**
     * Updates selected subaccount policy fields using optimistic concurrency.
     */
    async update(
        input: v.InferInput<typeof UpdateSubaccountPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountPolicy> {
        const validatedInput = parse(UpdateSubaccountPolicyInputSchema, input);
        const result = await this.#client.updateSubaccountPolicy(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!result.policy) throw new Error("Failed to update subaccount policy");
        return parse(SubaccountPolicySchema, result.policy);
    }

    /**
     * Deletes a subaccount policy template when it is not in use.
     */
    async delete(policyId: string, options?: PolyesterMutationOptions): Promise<void> {
        const validatedPolicyId = parse(PolicyIdSchema, policyId);
        await this.#client.deleteSubaccountPolicy(
            { policyId: validatedPolicyId },
            toConnectCallOptions(options),
        );
    }

    /**
     * Attaches a policy to a subaccount. Passing a null policyId clears the explicit binding and restores the system read-only policy.
     */
    async apply(
        input: v.InferInput<typeof ApplySubaccountPolicyInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const validatedInput = parse(ApplySubaccountPolicyInputSchema, input);
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
                const policy = parse(SubaccountPolicySchema, data);
                input.onEvent(policy);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: input.onError,
        });
    }
}
