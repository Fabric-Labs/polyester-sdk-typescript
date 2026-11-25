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
    AbandonInternalTransferBatchInputSchema,
    type AbandonInternalTransferBatchInput,
    BatchCreateInternalTransfersResultSchema,
    createBatchCreateInternalTransfersInputSchema,
    type BatchCreateInternalTransfersInput,
    type BatchCreateInternalTransfersResult,
    createCreateInternalTransferInputSchema,
    createCreateInternalTransferResultSchema,
    type CreateInternalTransferInput,
    type CreateInternalTransferResult,
    GetInternalTransferBatchInputSchema,
    GetInternalTransferInputSchema,
    GetInternalTransferResultSchema,
    type GetInternalTransferBatchInput,
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
     * Moves up to 500 transfers together under one idempotency key and one MFA check: every leg
     * is credited, or nothing moves. Every leg passes the same checks as `create` first; if one
     * fails, or a source cannot cover its legs, the batch is `"refused"`: nothing moves, no
     * step-up is used, the legs that caused it carry their `errorCode` and the rest are
     * `"not_moved"`. `"accepted"` means every leg is credited. A batch whose outcome is not known
     * within the request is `"processing"` and completes on its own: read it with `getBatch` by
     * its `requestId`, or retry with the same key and legs. An MFA-elevated session (an MFA
     * challenge completed in the last 30 minutes) covers the root owner moving funds between its
     * own accounts or to allowlisted destinations; any other leg needs one fresh step-up for the
     * whole batch.
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
     * Reads a batch's current status and every leg's state by exactly one of the `requestId`
     * `batchCreate` returned or the `idempotencyKey` sent to it, for example to follow a
     * `"processing"` batch. The caller must be allowed to read the transfers of every source
     * account of the batch; by `requestId`, any other batch is a `ResourceNotFoundError`. By
     * `idempotencyKey`, scoped to the session's account or the API key that sent it, a caller who
     * has since lost the right to move a source still reads the answer it lost, a batch refused
     * before it got a `requestId` reads its refusal, an abandoned key (`abandonBatch`) reads
     * `"abandoned"`, a caller who may not read a source gets `PermissionError`
     * (`ServiceUnavailableError` while that cannot be decided yet: retry), and
     * `ResourceNotFoundError` means no batch was sent under that key. Does not submit or retry the
     * batch and needs no step-up.
     */
    async getBatch(
        input: GetInternalTransferBatchInput,
        options?: PolyesterRequestOptions,
    ): Promise<BatchCreateInternalTransfersResult> {
        const request = parse(GetInternalTransferBatchInputSchema, input);
        const res = await this.#client.getInternalTransferBatch(
            request,
            toConnectCallOptions(options),
        );
        return parse(BatchCreateInternalTransfersResultSchema, res);
    }

    /**
     * Makes the absence of a batch under `idempotencyKey` final. If a batch was already submitted
     * under the key, returns its outcome just like `getBatch({ idempotencyKey })` and changes
     * nothing. Otherwise records the key as abandoned and returns `{ status: "abandoned",
     * requestId: undefined, legs: [] }`: no funds moved under the key and none ever will. Every
     * later `batchCreate` under that key throws `PreconditionFailedError`
     * (`IDEMPOTENCY_KEY_ABANDONED`), and every later `getBatch` or `abandonBatch` returns
     * `"abandoned"`. Requires no step-up.
     */
    async abandonBatch(
        input: AbandonInternalTransferBatchInput,
        options?: PolyesterRequestOptions,
    ): Promise<BatchCreateInternalTransfersResult> {
        const request = parse(AbandonInternalTransferBatchInputSchema, input);
        const res = await this.#client.abandonInternalTransferBatch(
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
