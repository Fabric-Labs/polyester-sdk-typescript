import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/chain/guard/v1/guard_signer_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { stepUpCallOptions } from "../../utils/step-up-call-options.js";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
import {
	BatchGuardApprovalsSchema,
	BatchSignProtectedActionInputSchema,
	CreateGuardSignerWalletResultSchema,
	ExportGuardSignerWalletResultSchema,
	GuardApprovalSchema,
	GuardSignerScopedInputSchema,
	GuardSignerStatusSchema,
	RotateGuardSignerWalletResultSchema,
	SignProtectedActionInputSchema,
	type BatchGuardApprovals,
	type BatchSignProtectedActionInput,
	type CreateGuardSignerWalletResult,
	type ExportGuardSignerWalletResult,
	type GuardApproval,
	type GuardSignerMutationOptions,
	type GuardSignerScopedInput,
	type GuardSignerStatus,
	type RotateGuardSignerWalletResult,
	type SignProtectedActionInput,
} from "./guard-signer.schemas.js";
import { isResourceNotFoundError } from "../../utils/errors.js";

export class GuardSignerService {
	#client: Client<typeof Proto.GuardSignerService>;
	#resolver?: SubAccountResolver;

	constructor(transport: Transport, resolver?: SubAccountResolver) {
		this.#client = createClient(Proto.GuardSignerService, transport);
		this.#resolver = resolver;
	}

	async createWallet(input: GuardSignerScopedInput = {}): Promise<CreateGuardSignerWalletResult> {
		const request = GuardSignerScopedInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.createGuardSignerWallet(removeUndefined(request));
		return CreateGuardSignerWalletResultSchema.parse(response);
	}

	async getStatus(input: GuardSignerScopedInput = {}): Promise<GuardSignerStatus | null> {
		const request = GuardSignerScopedInputSchema.parse(this.resolveInput(input));
		try {
			const response = await this.#client.getGuardSignerStatus(removeUndefined(request));
			return response.status ? GuardSignerStatusSchema.parse(response.status) : null;
		} catch (err) {
			if (isResourceNotFoundError(err)) return null;
			throw err;
		}
	}

	async signProtectedAction(
		input: SignProtectedActionInput,
		options?: GuardSignerMutationOptions
	): Promise<GuardApproval | null> {
		const request = SignProtectedActionInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.signProtectedAction(
			removeUndefined(request),
			stepUpCallOptions(options?.stepUpToken)
		);
		return response.approval ? GuardApprovalSchema.parse(response.approval) : null;
	}

	async batchSignProtectedActions(
		input: BatchSignProtectedActionInput,
		options?: GuardSignerMutationOptions
	): Promise<BatchGuardApprovals> {
		const request = BatchSignProtectedActionInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.batchSignProtectedActions(
			removeUndefined(request),
			stepUpCallOptions(options?.stepUpToken)
		);

		if (response.approvals.length !== input.actions.length) {
			throw new Error("Backend returned a mismatched number of GuardSigner approvals.");
		}

		return BatchGuardApprovalsSchema.parse(response);
	}

	async rotateWallet(
		input: GuardSignerScopedInput = {},
		options?: GuardSignerMutationOptions
	): Promise<RotateGuardSignerWalletResult> {
		const request = GuardSignerScopedInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.rotateGuardSignerWallet(
			removeUndefined(request),
			stepUpCallOptions(options?.stepUpToken)
		);
		return RotateGuardSignerWalletResultSchema.parse(response);
	}

	async exportWallet(
		input: GuardSignerScopedInput = {},
		options?: GuardSignerMutationOptions
	): Promise<ExportGuardSignerWalletResult> {
		const request = GuardSignerScopedInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.exportGuardSignerWallet(
			removeUndefined(request),
			stepUpCallOptions(options?.stepUpToken)
		);
		return ExportGuardSignerWalletResultSchema.parse(response);
	}

	private resolveInput<TInput extends { subAccountId?: string }>(input: TInput): TInput {
		return resolveSubAccountScopedInput(input, this.#resolver);
	}
}
