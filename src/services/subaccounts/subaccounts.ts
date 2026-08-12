import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import * as ProtoApiKeys from "../../gen/auth/v1/api_keys_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "../../shared/validation.js";
import { type ApiKey, ApiKeySchema } from "../api-keys/index.js";
import { formatId } from "../../utils/base58-id.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { PolyesterRealtime } from "../../realtime/index.js";
import {
    DEFAULT_SUBACCOUNT_POLICY,
    SubaccountPoliciesService,
    type SubaccountPolicy,
    SubaccountPolicySchema,
} from "../policies/subaccount-policies/index.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
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
    DeleteSubaccountInputSchema,
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

/**
 * Creates, manages, shares, audits, and subscribes to subaccounts visible to the authenticated caller.
 */
export class SubaccountsService {
    readonly policies: SubaccountPoliciesService;

    #client: Client<typeof Proto.SubaccountService>;
    #viewClient: Client<typeof Proto.SubaccountViewService>;
    #realtime: PolyesterRealtime;

    constructor(transport: Transport, realtime: PolyesterRealtime, resolver?: SubaccountResolver) {
        this.policies = new SubaccountPoliciesService(transport, realtime, resolver);
        this.#client = createClient(Proto.SubaccountService, transport);
        this.#viewClient = createClient(Proto.SubaccountViewService, transport);
        this.#realtime = realtime;
    }

    /**
     * Returns subaccounts owned by or shared with the caller plus totalCreated, including soft-deleted count metadata useful for deriving future smart-account salts.
     */
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

    /**
     * Fetches an aggregated subaccount dashboard view with subaccount details, policy, API keys, balances, members, and outgoing invites; throws if the subaccount is missing.
     */
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

    /**
     * Creates a new subaccount under the caller's root account using a smart-account address, nonce, and signature proof.
     */
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

    /**
     * Updates mutable subaccount display/status fields such as label and active/disabled/deleted status.
     */
    async update(
        input: v.InferInput<typeof UpdateSubaccountInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<Subaccount> {
        const validatedInput = v.parse(UpdateSubaccountInputSchema, input);
        const res = await this.#client.updateSubaccount(
            validatedInput,
            toConnectCallOptions(options),
        );
        if (!res.subaccount) throw new Error("Failed to update subaccount");
        return v.parse(SubaccountSchema, res.subaccount);
    }

    /**
     * Creates or refreshes a pending invitation granting a role on a subaccount to another root account.
     */
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

    /**
     * Removes delegated access for a subaccount member by grantee account ID.
     */
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

    /**
     * Changes an existing delegated member's role without sending a new invitation.
     */
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

    /**
     * Enables or disables the owner-controlled MFA requirement for delegated interactive member actions on a subaccount.
     */
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

    /**
     * Returns incoming, outgoing, or all subaccount invitations for the caller, newest first.
     */
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

    /**
     * Returns the owner and delegated members for a subaccount, including role and MFA enrollment status.
     */
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

    /**
     * Accepts or rejects an incoming invite, or cancels an outgoing invite, returning the updated invitation.
     */
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

    /**
     * Soft-deletes a subaccount by updating its status to deleted.
     */
    async delete(
        input: v.InferInput<typeof DeleteSubaccountInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<Subaccount> {
        const validatedInput = v.parse(DeleteSubaccountInputSchema, input);
        const res = await this.#client.updateSubaccount(
            {
                subaccountId: validatedInput.subaccountId,
                subaccount: { status: "deleted" },
                updateMask: { paths: ["status"] },
                expectedRevision: validatedInput.expectedRevision,
            },
            toConnectCallOptions(options),
        );
        if (!res.subaccount) throw new Error("Failed to delete subaccount");
        return v.parse(SubaccountSchema, res.subaccount);
    }

    /**
     * Returns paginated audit/activity events for a subaccount, newest first, with a limit capped at 200 and opaque cursor pagination.
     */
    async listEvents(
        input: v.InferInput<typeof SubaccountActivityInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<{ events: SubaccountEvent[]; nextPageToken: string }> {
        const validatedInput = v.parse(SubaccountActivityInputSchema, input);
        const res = await this.#viewClient.listSubaccountActivity(
            validatedInput,
            toConnectCallOptions(options),
        );
        return {
            events: v.parse(v.optional(v.array(SubaccountActivityEventSchema), []), res.events),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Subscribes to private subaccount updates for an account and emits normalized subaccount records.
     */
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

    /**
     * Subscribes to private API key updates for an account through the subaccount realtime channel helper.
     */
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
