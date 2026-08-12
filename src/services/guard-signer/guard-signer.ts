import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/chain/guard/v1/guard_signer_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { AccountScopedInput } from "../../shared/account-scope.js";
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
import { formatConnectError, isResourceNotFoundError } from "../../utils/errors.js";
import { parse } from "../../shared/validation.js";

const GUARD_SIGNER_WALLET_NOT_FOUND_MESSAGE = "guard signer wallet not found";

function isGuardSignerWalletNotFoundError(err: unknown): boolean {
    return formatConnectError(err, "")
        .toLowerCase()
        .includes(GUARD_SIGNER_WALLET_NOT_FOUND_MESSAGE);
}

/**
 * Manages backend guard signer wallets and approval signatures for protected Polyester account actions.
 */
export class GuardSignerService {
    #client: Client<typeof Proto.GuardSignerService>;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.GuardSignerService, transport);
        this.#resolver = resolver;
    }

    /**
     * Creates a guard signer wallet for the resolved account target and returns the generated signer EVM address.
     */
    async createWallet(
        input: GuardSignerScopedInput = {},
        options?: PolyesterMutationOptions,
    ): Promise<CreateGuardSignerWalletResult> {
        const request = parse(GuardSignerScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.createGuardSignerWallet(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(CreateGuardSignerWalletResultSchema, response);
    }

    /**
     * Returns stored and live guard signer status for the resolved account target, including signer address, on-chain signer, initialization state, nonce, and nonce space. Returns null when the backend reports the wallet is not found.
     */
    async getStatus(
        input: GuardSignerScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<GuardSignerStatus | null> {
        const request = parse(GuardSignerScopedInputSchema, this.resolveInput(input));
        try {
            const response = await this.#client.getGuardSignerStatus(
                removeUndefined(request),
                toConnectCallOptions(options),
            );
            return response.status ? parse(GuardSignerStatusSchema, response.status) : null;
        } catch (err) {
            if (isResourceNotFoundError(err) || isGuardSignerWalletNotFoundError(err)) return null;
            throw err;
        }
    }

    /**
     * Creates one guard approval signature for a supported protected action, such as whitelist updates or whitelist requirement changes. Returns null if the backend response has no approval payload.
     */
    async signProtectedAction(
        input: SignProtectedActionInput,
        options?: PolyesterMutationOptions,
    ): Promise<GuardApproval | null> {
        const request = parse(SignProtectedActionInputSchema, this.resolveInput(input));
        const response = await this.#client.signProtectedAction(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.approval ? parse(GuardApprovalSchema, response.approval) : null;
    }

    /**
     * Creates ordered guard approval signatures for a batch of protected actions and verifies the backend returned one approval per requested action.
     */
    async batchSignProtectedActions(
        input: BatchSignProtectedActionInput,
        options?: PolyesterMutationOptions,
    ): Promise<BatchGuardApprovals> {
        const request = parse(BatchSignProtectedActionInputSchema, this.resolveInput(input));
        const response = await this.#client.batchSignProtectedActions(
            removeUndefined(request),
            toConnectCallOptions(options),
        );

        if (response.approvals.length !== input.actions.length) {
            throw new Error("Backend returned a mismatched number of GuardSigner approvals.");
        }

        return parse(BatchGuardApprovalsSchema, response);
    }

    /**
     * Generates a backend-managed replacement guard signer for the resolved account target and returns the new signer address plus the rotation approval payload.
     */
    async rotateWallet(
        input: GuardSignerScopedInput = {},
        options?: PolyesterMutationOptions,
    ): Promise<RotateGuardSignerWalletResult> {
        const request = parse(GuardSignerScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.rotateGuardSignerWallet(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(RotateGuardSignerWalletResultSchema, response);
    }

    /**
     * Exports guard signer private key material for the resolved account target after owner authorization and fresh step-up, returning the backend export response.
     */
    async exportWallet(
        input: GuardSignerScopedInput = {},
        options?: PolyesterMutationOptions,
    ): Promise<ExportGuardSignerWalletResult> {
        const request = parse(GuardSignerScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.exportGuardSignerWallet(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(ExportGuardSignerWalletResultSchema, response);
    }

    private resolveInput<TInput extends AccountScopedInput>(input: TInput): TInput {
        return resolveAccountScopedInput(input, this.#resolver);
    }
}
