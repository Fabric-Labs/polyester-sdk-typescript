import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/chain/guard/v1/guard_signer_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
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
    type GuardSignerScopedInput,
    type GuardSignerStatus,
    type RotateGuardSignerWalletResult,
    type SignProtectedActionInput,
} from "./guard-signer.schemas.js";
import { isResourceNotFoundError } from "../../utils/errors.js";
import * as v from "valibot";

export type GuardSignerMutationOptions = PolyesterMutationOptions;

export class GuardSignerService {
    #client: Client<typeof Proto.GuardSignerService>;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.GuardSignerService, transport);
        this.#resolver = resolver;
    }

    async createWallet(
        input: GuardSignerScopedInput = {},
        options?: PolyesterMutationOptions,
    ): Promise<CreateGuardSignerWalletResult> {
        const request = v.parse(GuardSignerScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.createGuardSignerWallet(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return v.parse(CreateGuardSignerWalletResultSchema, response);
    }

    async getStatus(
        input: GuardSignerScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<GuardSignerStatus | null> {
        const request = v.parse(GuardSignerScopedInputSchema, this.resolveInput(input));
        try {
            const response = await this.#client.getGuardSignerStatus(
                removeUndefined(request),
                toConnectCallOptions(options),
            );
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
            toConnectCallOptions(options),
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
            toConnectCallOptions(options),
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
            toConnectCallOptions(options),
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
            toConnectCallOptions(options),
        );
        return v.parse(ExportGuardSignerWalletResultSchema, response);
    }

    private resolveInput<TInput extends { subaccountId?: string }>(input: TInput): TInput {
        return resolveSubaccountScopedInput(input, this.#resolver);
    }
}
