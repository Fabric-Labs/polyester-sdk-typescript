import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import * as ProtoApiKeys from "../../gen/auth/v1/api_keys_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { type ApiKey, ApiKeySchema } from "../api-keys/index.js";
import { formatId } from "../../utils/base58-id.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { RealtimeClient } from "../../realtime/index.js";
import {
    DEFAULT_SUBACCOUNT_POLICY,
    SubaccountPoliciesService,
    type SubaccountPolicy,
    SubaccountPolicySchema,
} from "../policies/subaccount-policies/index.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    CreateSubaccountInputSchema,
    CreateSubaccountResultSchema,
    UpdateSubaccountInputSchema,
    InviteSubaccountMemberInputSchema,
    RemoveSubaccountMemberInputSchema,
    UpdateSubaccountMemberRoleInputSchema,
    ListSubaccountInvitesInputSchema,
    RespondSubaccountInviteInputSchema,
    SubaccountActivityInputSchema,
    SubaccountSchema,
    SubaccountMemberSchema,
    SubaccountInviteSchema,
    SubaccountActivityEventSchema,
    SetSubaccountMemberMfaRequirementInputSchema,
    SubaccountIdInputSchema,
    SubaccountMutationResultSchema,
    type CreateSubaccountResult,
    type Subaccount,
    type SubaccountMember,
    type SubaccountInvite,
    type SubaccountEvent,
    type SubaccountMutationResult,
} from "./subaccounts.schemas.js";

interface SubscribeSubaccountsInput extends BaseSubscribeInput<Subaccount> {
    accountId: string;
}

interface SubscribeApiKeysInput extends BaseSubscribeInput<ApiKey> {
    accountId: string;
}

export class SubaccountsService {
    readonly policies: SubaccountPoliciesService;

    #client: Client<typeof Proto.SubaccountService>;
    #viewClient: Client<typeof Proto.SubaccountViewService>;
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.policies = new SubaccountPoliciesService(transport, realtime);
        this.#client = createClient(Proto.SubaccountService, transport);
        this.#viewClient = createClient(Proto.SubaccountViewService, transport);
        this.#realtime = realtime;
    }

    async list(options?: PolyesterRequestOptions): Promise<{
        totalCreated: number;
        subaccounts: v.InferOutput<typeof SubaccountSchema>[];
    }> {
        const res = await this.#client.listSubaccounts({}, toConnectCallOptions(options));
        return {
            totalCreated: res.totalCreated,
            subaccounts: v.parse(v.array(SubaccountSchema), res.subaccounts),
        };
    }

    async get(
        input: v.InferInput<typeof SubaccountIdInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<
        Subaccount & {
            apiKeys: ApiKey[];
            policy: SubaccountPolicy;
            members: SubaccountMember[];
            invites: SubaccountInvite[];
        }
    > {
        const validatedInput = v.parse(SubaccountIdInputSchema, input);
        const subaccountId = formatId(validatedInput.subaccountId);
        const res = await this.#viewClient.getSubaccount(
            {
                subaccountId: validatedInput.subaccountId,
                includeApiKeys: true,
                includeBalances: true,
                includeMembers: true,
                includeInvites: true,
                includePolicy: true,
                invitesDirection: "outgoing",
            },
            toConnectCallOptions(options),
        );
        if (!res.subaccount) throw new Error(`Subaccount not found: ${subaccountId}`);

        return {
            ...v.parse(SubaccountSchema, res.subaccount),
            policy: res.policy
                ? v.parse(SubaccountPolicySchema, res.policy)
                : DEFAULT_SUBACCOUNT_POLICY,
            apiKeys: v.parse(v.optional(v.array(ApiKeySchema), []), res.apiKeys),
            members: v.parse(v.optional(v.array(SubaccountMemberSchema), []), res.members),
            invites: v
                .parse(v.optional(v.array(SubaccountInviteSchema), []), res.invites)
                .filter((invite) => invite.subaccountId === subaccountId),
        };
    }

    async create(
        input: v.InferInput<typeof CreateSubaccountInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<CreateSubaccountResult> {
        const validatedInput = v.parse(CreateSubaccountInputSchema, input);
        const res = await this.#client.createSubaccount(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(CreateSubaccountResultSchema, res);
    }

    async update(
        input: v.InferInput<typeof UpdateSubaccountInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountMutationResult> {
        const validatedInput = v.parse(UpdateSubaccountInputSchema, input);
        const res = await this.#client.updateSubaccount(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(SubaccountMutationResultSchema, res);
    }

    async inviteMember(
        input: v.InferInput<typeof InviteSubaccountMemberInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountInvite> {
        const validatedInput = v.parse(InviteSubaccountMemberInputSchema, input);
        const res = await this.#client.inviteSubaccountMember(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(SubaccountInviteSchema, res.invite);
    }

    async removeMember(
        input: v.InferInput<typeof RemoveSubaccountMemberInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountMutationResult> {
        const validatedInput = v.parse(RemoveSubaccountMemberInputSchema, input);
        const res = await this.#client.removeSubaccountMember(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(SubaccountMutationResultSchema, res);
    }

    async updateMemberRole(
        input: v.InferInput<typeof UpdateSubaccountMemberRoleInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountMutationResult> {
        const validatedInput = v.parse(UpdateSubaccountMemberRoleInputSchema, input);
        const res = await this.#client.updateSubaccountMemberRole(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(SubaccountMutationResultSchema, res);
    }

    async setMemberMfaRequirement(
        input: v.InferInput<typeof SetSubaccountMemberMfaRequirementInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountMutationResult> {
        const validatedInput = v.parse(SetSubaccountMemberMfaRequirementInputSchema, input);
        const res = await this.#client.setSubaccountMemberMFARequirement(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(SubaccountMutationResultSchema, res);
    }

    async listInvites(
        input: v.InferInput<typeof ListSubaccountInvitesInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<SubaccountInvite[]> {
        const validatedInput = v.parse(ListSubaccountInvitesInputSchema, input);
        const res = await this.#client.listSubaccountInvites(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(v.array(SubaccountInviteSchema), res.invites);
    }

    async listMembers(
        input: v.InferInput<typeof SubaccountIdInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<SubaccountMember[]> {
        const validatedInput = v.parse(SubaccountIdInputSchema, input);
        const res = await this.#client.listSubaccountMembers(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(v.array(SubaccountMemberSchema), res.members);
    }

    async respondInvite(
        input: v.InferInput<typeof RespondSubaccountInviteInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountInvite> {
        const validatedInput = v.parse(RespondSubaccountInviteInputSchema, input);
        const res = await this.#client.respondSubaccountInvite(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(SubaccountInviteSchema, res.invite);
    }

    async delete(
        input: v.InferInput<typeof SubaccountIdInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<SubaccountMutationResult> {
        const validatedInput = v.parse(SubaccountIdInputSchema, input);
        const res = await this.#client.updateSubaccount(
            {
                subaccountId: validatedInput.subaccountId,
                status: "deleted",
            },
            toConnectCallOptions(options),
        );
        return v.parse(SubaccountMutationResultSchema, res);
    }

    async listEvents(
        input: v.InferInput<typeof SubaccountActivityInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<{ events: SubaccountEvent[]; nextCursor: string }> {
        const validatedInput = v.parse(SubaccountActivityInputSchema, input);
        const res = await this.#viewClient.listSubaccountActivity(
            validatedInput,
            toConnectCallOptions(options),
        );
        return {
            events: v.parse(v.optional(v.array(SubaccountActivityEventSchema), []), res.events),
            nextCursor: res.nextCursor,
        };
    }

    subscribe(input: SubscribeSubaccountsInput) {
        const channel = `private:auth:subaccounts:${input.accountId}:proto`;

        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.SubaccountSchema,
            onPublication: (data) => {
                const subaccount = v.parse(SubaccountSchema, data);
                input.onEvent(subaccount);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }

    subscribeApiKeys(input: SubscribeApiKeysInput) {
        const channel = `private:auth:api-keys:${input.accountId}:proto`;

        return this.#realtime.connectProtoChannel({
            channel,
            schema: ProtoApiKeys.ApiKeySchema,
            onPublication: (data) => {
                const apiKey = v.parse(ApiKeySchema, data);
                input.onEvent(apiKey);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
