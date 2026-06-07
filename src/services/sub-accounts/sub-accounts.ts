import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import * as ProtoApiKeys from "../../gen/auth/v1/api_keys_pb.js";
import * as ProtoPolicies from "../../gen/auth/v1/policies_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import { type ApiKey, ApiKeySchema } from "../api-keys/index.js";
import { idToBigInt } from "../../utils/base58-id.js";
import { stepUpCallOptions } from "../../utils/step-up-call-options.js";
import { connectProtoChannel } from "../../realtime/index.js";
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

	constructor(transport: Transport) {
		this.#client = createClient(Proto.SubaccountService, transport);
		this.#viewClient = createClient(Proto.SubaccountViewService, transport);
	}

	async list(): Promise<{
		totalCreated: number;
		subAccounts: z.output<typeof SubAccountSchema>[];
	}> {
		const res = await this.#client.listSubaccounts({});
		return {
			totalCreated: res.totalCreated,
			subAccounts: z.array(SubAccountSchema).parse(res.subaccounts),
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
			...SubAccountSchema.parse(res.subaccount),
			policy: res.policy
				? SubAccountPolicySchema.parse(res.policy)
				: DEFAULT_SUBACCOUNT_POLICY,
			apiKeys: z.array(ApiKeySchema).default([]).parse(res.apiKeys),
			members: z.array(SubAccountMemberSchema).default([]).parse(res.members),
			invites: z
				.array(SubAccountInviteSchema)
				.default([])
				.parse(res.invites)
				.filter((invite) => invite.subAccountId === subaccountId),
		};
	}

	async create(
		input: z.input<typeof CreateSubAccountInputSchema>
	): Promise<Proto.CreateSubaccountResponse> {
		const validatedInput = CreateSubAccountInputSchema.parse(input);
		return this.#client.createSubaccount(validatedInput);
	}

	async update(
		input: z.input<typeof UpdateSubAccountInputSchema>
	): Promise<Proto.UpdateSubaccountResponse> {
		const validatedInput = UpdateSubAccountInputSchema.parse(input);
		return await this.#client.updateSubaccount(validatedInput);
	}

	async inviteMember(
		input: z.input<typeof InviteSubAccountMemberInputSchema>,
		options?: { stepUpToken?: string | null }
	): Promise<SubAccountInvite> {
		const validatedInput = InviteSubAccountMemberInputSchema.parse(input);
		const res = await this.#client.inviteSubaccountMember(
			validatedInput,
			stepUpCallOptions(options?.stepUpToken)
		);
		return SubAccountInviteSchema.parse(res.invite);
	}

	async removeMember(
		input: z.input<typeof RemoveSubAccountMemberInputSchema>
	): Promise<Proto.RemoveSubaccountMemberResponse> {
		const validatedInput = RemoveSubAccountMemberInputSchema.parse(input);
		return this.#client.removeSubaccountMember(validatedInput);
	}

	async updateMemberRole(
		input: z.input<typeof UpdateSubAccountMemberRoleInputSchema>
	): Promise<Proto.UpdateSubaccountMemberRoleResponse> {
		const validatedInput = UpdateSubAccountMemberRoleInputSchema.parse(input);
		return this.#client.updateSubaccountMemberRole(validatedInput);
	}

	async setMemberMfaRequirement(
		input: z.input<typeof SetSubAccountMemberMfaRequirementInputSchema>,
		options?: { stepUpToken?: string | null }
	): Promise<void> {
		const validatedInput = SetSubAccountMemberMfaRequirementInputSchema.parse(input);
		await this.#client.setSubaccountMemberMFARequirement(
			validatedInput,
			stepUpCallOptions(options?.stepUpToken)
		);
	}

	async listInvites(
		input: z.input<typeof ListSubAccountInvitesInputSchema>
	): Promise<SubAccountInvite[]> {
		const validatedInput = ListSubAccountInvitesInputSchema.parse(input);
		const res = await this.#client.listSubaccountInvites(validatedInput);
		return z.array(SubAccountInviteSchema).parse(res.invites);
	}

	async listMembers(subAccountId: string): Promise<SubAccountMember[]> {
		const res = await this.#client.listSubaccountMembers({
			subaccountId: idToBigInt(subAccountId, "subaccountId"),
		});
		return z.array(SubAccountMemberSchema).parse(res.members);
	}

	async respondInvite(
		input: z.input<typeof RespondSubAccountInviteInputSchema>,
		options?: { stepUpToken?: string | null }
	): Promise<SubAccountInvite> {
		const validatedInput = RespondSubAccountInviteInputSchema.parse(input);
		const res = await this.#client.respondSubaccountInvite(
			validatedInput,
			stepUpCallOptions(options?.stepUpToken)
		);
		return SubAccountInviteSchema.parse(res.invite);
	}

	async delete(subAccountId: string): Promise<void> {
		const validatedSubAccountId = idToBigInt(subAccountId, "subaccountId");
		await this.#client.updateSubaccount({
			subaccountId: validatedSubAccountId,
			status: "deleted",
		});
	}

	async listEvents(
		input: z.input<typeof SubAccountActivityInputSchema>
	): Promise<{ events: SubAccountEvent[]; nextCursor: string }> {
		const validatedInput = SubAccountActivityInputSchema.parse(input);
		const res = await this.#viewClient.listSubaccountActivity(validatedInput);
		return {
			events: z.array(SubAccountActivityEventSchema).default([]).parse(res.events),
			nextCursor: res.nextCursor,
		};
	}

	subscribe(input: SubscribeSubAccountsInput) {
		const channel = `private:auth:subaccounts:${input.accountId}:proto`;

		return connectProtoChannel({
			channel,
			schema: Proto.SubaccountSchema,
			onPublication: (data) => {
				const subAccount = SubAccountSchema.parse(data);
				input.onEvent(subAccount);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
		});
	}

	subscribeApiKeys(input: SubscribeApiKeysInput) {
		const channel = `private:auth:api-keys:${input.accountId}:proto`;

		return connectProtoChannel({
			channel,
			schema: ProtoApiKeys.ApiKeySchema,
			onPublication: (data) => {
				const apiKey = ApiKeySchema.parse(data);
				input.onEvent(apiKey);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
		});
	}

	subscribePolicies(input: SubscribePoliciesInput) {
		const channel = `private:auth:subaccount-policies:${input.accountId}:proto`;

		return connectProtoChannel({
			channel,
			schema: ProtoPolicies.SubaccountPolicyViewSchema,
			onPublication: (data) => {
				const policy = SubAccountPolicySchema.parse(data);
				input.onEvent(policy);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
		});
	}
}
