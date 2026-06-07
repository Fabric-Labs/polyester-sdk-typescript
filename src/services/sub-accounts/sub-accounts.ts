import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import * as ProtoApiKeys from "../../gen/auth/v1/api_keys_pb.js";
import * as ProtoPolicies from "../../gen/auth/v1/policies_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { type ApiKey, ApiKeySchema } from "../api-keys/index.js";
import { idToBigInt } from "../../utils/base58-id.js";
import { stepUpCallOptions } from "../../utils/step-up-call-options.js";
import type { RealtimeClient } from "../../realtime/index.js";
import {
    DEFAULT_SUBACCOUNT_POLICY,
    type SubAccountPolicy,
    SubAccountPolicySchema,
} from "../policies/sub-account-policies/index.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    CreateSubAccountInputSchema,
    UpdateSubAccountInputSchema,
    InviteSubAccountMemberInputSchema,
    RemoveSubAccountMemberInputSchema,
    UpdateSubAccountMemberRoleInputSchema,
    ListSubAccountInvitesInputSchema,
    RespondSubAccountInviteInputSchema,
    SubAccountActivityInputSchema,
    SubAccountSchema,
    SubAccountMemberSchema,
    SubAccountInviteSchema,
    SubAccountActivityEventSchema,
    SetSubAccountMemberMfaRequirementInputSchema,
    type SubAccount,
    type SubAccountMember,
    type SubAccountInvite,
    type SubAccountEvent,
} from "./sub-accounts.schemas.js";

interface SubscribeSubAccountsInput extends BaseSubscribeInput<SubAccount> {
    accountId: string;
}

interface SubscribeApiKeysInput extends BaseSubscribeInput<ApiKey> {
    accountId: string;
}

interface SubscribePoliciesInput extends BaseSubscribeInput<SubAccountPolicy> {
    accountId: string;
}

export class SubAccountsService {
    #client: Client<typeof Proto.SubaccountService>;
    #viewClient: Client<typeof Proto.SubaccountViewService>;
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(Proto.SubaccountService, transport);
        this.#viewClient = createClient(Proto.SubaccountViewService, transport);
        this.#realtime = realtime;
    }

    async list(): Promise<{
        totalCreated: number;
        subAccounts: v.InferOutput<typeof SubAccountSchema>[];
    }> {
        const res = await this.#client.listSubaccounts({});
        return {
            totalCreated: res.totalCreated,
            subAccounts: v.parse(v.array(SubAccountSchema), res.subaccounts),
        };
    }

    async get(subaccountId: string): Promise<
        SubAccount & {
            apiKeys: ApiKey[];
            policy: SubAccountPolicy;
            members: SubAccountMember[];
            invites: SubAccountInvite[];
        }
    > {
        const res = await this.#viewClient.getSubaccount({
            subaccountId: idToBigInt(subaccountId, "subaccountId"),
            includeApiKeys: true,
            includeBalances: true,
            includeMembers: true,
            includeInvites: true,
            includePolicy: true,
            invitesDirection: "outgoing",
        });
        if (!res.subaccount) throw new Error(`Subaccount not found: ${subaccountId}`);

        return {
            ...v.parse(SubAccountSchema, res.subaccount),
            policy: res.policy
                ? v.parse(SubAccountPolicySchema, res.policy)
                : DEFAULT_SUBACCOUNT_POLICY,
            apiKeys: v.parse(v.optional(v.array(ApiKeySchema), []), res.apiKeys),
            members: v.parse(v.optional(v.array(SubAccountMemberSchema), []), res.members),
            invites: v
                .parse(v.optional(v.array(SubAccountInviteSchema), []), res.invites)
                .filter((invite) => invite.subAccountId === subaccountId),
        };
    }

    async create(
        input: v.InferInput<typeof CreateSubAccountInputSchema>,
    ): Promise<Proto.CreateSubaccountResponse> {
        const validatedInput = v.parse(CreateSubAccountInputSchema, input);
        return this.#client.createSubaccount(validatedInput);
    }

    async update(
        input: v.InferInput<typeof UpdateSubAccountInputSchema>,
    ): Promise<Proto.UpdateSubaccountResponse> {
        const validatedInput = v.parse(UpdateSubAccountInputSchema, input);
        return await this.#client.updateSubaccount(validatedInput);
    }

    async inviteMember(
        input: v.InferInput<typeof InviteSubAccountMemberInputSchema>,
        options?: { stepUpToken?: string | null },
    ): Promise<SubAccountInvite> {
        const validatedInput = v.parse(InviteSubAccountMemberInputSchema, input);
        const res = await this.#client.inviteSubaccountMember(
            validatedInput,
            stepUpCallOptions(options?.stepUpToken),
        );
        return v.parse(SubAccountInviteSchema, res.invite);
    }

    async removeMember(
        input: v.InferInput<typeof RemoveSubAccountMemberInputSchema>,
    ): Promise<Proto.RemoveSubaccountMemberResponse> {
        const validatedInput = v.parse(RemoveSubAccountMemberInputSchema, input);
        return this.#client.removeSubaccountMember(validatedInput);
    }

    async updateMemberRole(
        input: v.InferInput<typeof UpdateSubAccountMemberRoleInputSchema>,
    ): Promise<Proto.UpdateSubaccountMemberRoleResponse> {
        const validatedInput = v.parse(UpdateSubAccountMemberRoleInputSchema, input);
        return this.#client.updateSubaccountMemberRole(validatedInput);
    }

    async setMemberMfaRequirement(
        input: v.InferInput<typeof SetSubAccountMemberMfaRequirementInputSchema>,
        options?: { stepUpToken?: string | null },
    ): Promise<void> {
        const validatedInput = v.parse(SetSubAccountMemberMfaRequirementInputSchema, input);
        await this.#client.setSubaccountMemberMFARequirement(
            validatedInput,
            stepUpCallOptions(options?.stepUpToken),
        );
    }

    async listInvites(
        input: v.InferInput<typeof ListSubAccountInvitesInputSchema>,
    ): Promise<SubAccountInvite[]> {
        const validatedInput = v.parse(ListSubAccountInvitesInputSchema, input);
        const res = await this.#client.listSubaccountInvites(validatedInput);
        return v.parse(v.array(SubAccountInviteSchema), res.invites);
    }

    async listMembers(subAccountId: string): Promise<SubAccountMember[]> {
        const res = await this.#client.listSubaccountMembers({
            subaccountId: idToBigInt(subAccountId, "subaccountId"),
        });
        return v.parse(v.array(SubAccountMemberSchema), res.members);
    }

    async respondInvite(
        input: v.InferInput<typeof RespondSubAccountInviteInputSchema>,
        options?: { stepUpToken?: string | null },
    ): Promise<SubAccountInvite> {
        const validatedInput = v.parse(RespondSubAccountInviteInputSchema, input);
        const res = await this.#client.respondSubaccountInvite(
            validatedInput,
            stepUpCallOptions(options?.stepUpToken),
        );
        return v.parse(SubAccountInviteSchema, res.invite);
    }

    async delete(subAccountId: string): Promise<void> {
        const validatedSubAccountId = idToBigInt(subAccountId, "subaccountId");
        await this.#client.updateSubaccount({
            subaccountId: validatedSubAccountId,
            status: "deleted",
        });
    }

    async listEvents(
        input: v.InferInput<typeof SubAccountActivityInputSchema>,
    ): Promise<{ events: SubAccountEvent[]; nextCursor: string }> {
        const validatedInput = v.parse(SubAccountActivityInputSchema, input);
        const res = await this.#viewClient.listSubaccountActivity(validatedInput);
        return {
            events: v.parse(v.optional(v.array(SubAccountActivityEventSchema), []), res.events),
            nextCursor: res.nextCursor,
        };
    }

    subscribe(input: SubscribeSubAccountsInput) {
        const channel = `private:auth:subaccounts:${input.accountId}:proto`;

        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.SubaccountSchema,
            onPublication: (data) => {
                const subAccount = v.parse(SubAccountSchema, data);
                input.onEvent(subAccount);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
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
        });
    }

    subscribePolicies(input: SubscribePoliciesInput) {
        const channel = `private:auth:subaccount-policies:${input.accountId}:proto`;

        return this.#realtime.connectProtoChannel({
            channel,
            schema: ProtoPolicies.SubaccountPolicyViewSchema,
            onPublication: (data) => {
                const policy = v.parse(SubAccountPolicySchema, data);
                input.onEvent(policy);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
        });
    }
}
