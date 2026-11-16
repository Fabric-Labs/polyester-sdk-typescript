import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/transfer/v1/internal_transfer_pb.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import {
    type SubaccountResolver,
    resolveAccountScope,
    resolveAccountScopedInput,
} from "../subaccount-resolver.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import { parse } from "../../shared/validation.js";
import {
    BatchCreateInternalTransfersResultSchema,
    createBatchCreateInternalTransfersInputSchema,
    type BatchCreateInternalTransfersInput,
    type BatchCreateInternalTransfersResult,
    createCreateInternalTransferInputSchema,
    createCreateInternalTransferResultSchema,
    type CreateInternalTransferInput,
    type CreateInternalTransferResult,
    GetInternalTransferInputSchema,
    GetInternalTransferResultSchema,
    type GetInternalTransferInput,
    type GetInternalTransferResult,
} from "./internal-transfers.schemas.js";

/**
 * Creates and reads authenticated Trading-to-Trading internal transfer requests.
 */
export class InternalTransfersService {
    #client: Client<typeof Proto.InternalTransferService>;
    #resolver?: SubaccountResolver;
    #scales: SdkScales;
    #inputSchema: ReturnType<typeof createCreateInternalTransferInputSchema>;
    #resultSchema: ReturnType<typeof createCreateInternalTransferResultSchema>;
    #batchInputSchema: ReturnType<typeof createBatchCreateInternalTransfersInputSchema>;

    constructor(
        transports: AuthApiTransports,
        resolver: SubaccountResolver | undefined,
        scales: SdkScales,
    ) {
        this.#client = createClient(Proto.InternalTransferService, transports.authApi);
        this.#resolver = resolver;
        this.#scales = scales;
        this.#inputSchema = createCreateInternalTransferInputSchema(scales);
        this.#resultSchema = createCreateInternalTransferResultSchema();
        this.#batchInputSchema = createBatchCreateInternalTransfersInputSchema(scales);
    }

    /**
     * Creates or returns an idempotent internal transfer from the resolved source account to a destination root account, subaccount, or smart-account address. The request carries asset id, a decimal quantity, and a stable idempotency key; the response includes request/transfer ids, the lifecycle `flowId`, resolved destination, and status. Rejections and failures, such as insufficient funds or a missing step-up, raise errors instead of returning a result.
     */
    async create(
        input: CreateInternalTransferInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateInternalTransferResult> {
        await this.#scales.ready();
        const resolvedInput = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = parse(this.#inputSchema, resolvedInput);
        const res = await this.#client.createInternalTransfer(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return parse(this.#resultSchema, res);
    }

    /**
     * Submits up to 10 transfers under one idempotency key and one MFA check. Every leg passes
     * the same checks as `create` first; if one fails, the batch is `"refused"`: nothing moves,
     * no step-up is used, the failing legs carry their `errorCode` and the rest are
     * `"not_submitted"`. Otherwise the legs run in order and are not atomic: a leg can be
     * `"refused"`, for example for insufficient balance, after earlier legs were accepted. Read
     * each leg's `status`; a `"pending"` leg is like a timed-out `create`: read it with `get` by
     * its `requestId`, or retry the batch with the same key and legs. Recent MFA covers the root
     * owner moving funds between its own accounts or to allowlisted destinations; any other leg
     * needs one fresh step-up for the whole batch.
     */
    async batchCreate(
        input: BatchCreateInternalTransfersInput,
        options?: PolyesterMutationOptions,
    ): Promise<BatchCreateInternalTransfersResult> {
        await this.#scales.ready();
        const legs = Array.isArray(input?.legs)
            ? input.legs.map((leg) => ({
                  ...leg,
                  account: resolveAccountScope(leg?.account, this.#resolver),
              }))
            : input?.legs;
        const request = parse(this.#batchInputSchema, { ...input, legs });
        const res = await this.#client.batchCreateInternalTransfers(
            request,
            toConnectCallOptions(options),
        );
        return parse(BatchCreateInternalTransfersResultSchema, res);
    }

    /**
     * Reads an accepted transfer of the resolved source account by exactly one of `requestId` or
     * `transferId`, and returns both IDs, the lifecycle `flowId` and the acceptance time. Use it
     * to reconcile a transfer without resubmitting it; pass `flowId` to `lifecycle.getAccountFlow`,
     * whose ledger settlement step carries the transfer ID. An unknown, pending or inaccessible
     * transfer is a `ResourceNotFoundError`, including briefly after a delegate is granted access.
     * Session JWT only; API keys are refused. Moves no money and needs no step-up.
     */
    async get(
        input: GetInternalTransferInput,
        options?: PolyesterRequestOptions,
    ): Promise<GetInternalTransferResult> {
        const resolvedInput = resolveAccountScopedInput(input, this.#resolver);
        const request = parse(GetInternalTransferInputSchema, resolvedInput);
        const res = await this.#client.getInternalTransfer(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(GetInternalTransferResultSchema, res);
    }
}
