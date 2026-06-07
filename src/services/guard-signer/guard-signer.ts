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
import * as v from "valibot";

export class GuardSignerService {
    #client: Client<typeof Proto.GuardSignerService>;
    #resolver?: SubAccountResolver;

    constructor(transport: Transport, resolver?: SubAccountResolver) {
        this.#client = createClient(Proto.GuardSignerService, transport);
        this.#resolver = resolver;
    }

    async createWallet(input: GuardSignerScopedInput = {}): Promise<CreateGuardSignerWalletResult> {
        const request = v.parse(GuardSignerScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.createGuardSignerWallet(removeUndefined(request));
        return v.parse(CreateGuardSignerWalletResultSchema, response);
    }

    async getStatus(input: GuardSignerScopedInput = {}): Promise<GuardSignerStatus | null> {
        const request = v.parse(GuardSignerScopedInputSchema, this.resolveInput(input));
        try {
            const response = await this.#client.getGuardSignerStatus(removeUndefined(request));
            return response.status ? v.parse(GuardSignerStatusSchema, response.status) : null;
        } catch (err) {
            if (isResourceNotFoundError(err)) return null;
            throw err;
        }
    }

    async signProtectedAction(
        input: SignProtectedActionInput,
        options?: GuardSignerMutationOptions,
    ): Promise<GuardApproval | null> {
        const request = v.parse(SignProtectedActionInputSchema, this.resolveInput(input));
        const response = await this.#client.signProtectedAction(
            removeUndefined(request),
            stepUpCallOptions(options?.stepUpToken),
        );
        return response.approval ? v.parse(GuardApprovalSchema, response.approval) : null;
    }

    async batchSignProtectedActions(
        input: BatchSignProtectedActionInput,
        options?: GuardSignerMutationOptions,
    ): Promise<BatchGuardApprovals> {
        const request = v.parse(BatchSignProtectedActionInputSchema, this.resolveInput(input));
        const response = await this.#client.batchSignProtectedActions(
            removeUndefined(request),
            stepUpCallOptions(options?.stepUpToken),
        );

        if (response.approvals.length !== input.actions.length) {
            throw new Error("Backend returned a mismatched number of GuardSigner approvals.");
        }

        return v.parse(BatchGuardApprovalsSchema, response);
    }

    async rotateWallet(
        input: GuardSignerScopedInput = {},
        options?: GuardSignerMutationOptions,
    ): Promise<RotateGuardSignerWalletResult> {
        const request = v.parse(GuardSignerScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.rotateGuardSignerWallet(
            removeUndefined(request),
            stepUpCallOptions(options?.stepUpToken),
        );
        return v.parse(RotateGuardSignerWalletResultSchema, response);
    }

    async exportWallet(
        input: GuardSignerScopedInput = {},
        options?: GuardSignerMutationOptions,
    ): Promise<ExportGuardSignerWalletResult> {
        const request = v.parse(GuardSignerScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.exportGuardSignerWallet(
            removeUndefined(request),
            stepUpCallOptions(options?.stepUpToken),
        );
        return v.parse(ExportGuardSignerWalletResultSchema, response);
    }

    private resolveInput<TInput extends { subAccountId?: string }>(input: TInput): TInput {
        return resolveSubAccountScopedInput(input, this.#resolver);
    }
}
