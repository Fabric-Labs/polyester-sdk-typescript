import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/transfer/v1/internal_transfer_pb.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import { parse } from "../../shared/validation.js";
import {
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
    }

    /**
     * Creates or returns an idempotent internal transfer from the resolved source account to a destination root account, subaccount, or smart-account address. The request carries asset id, a decimal quantity, and a stable idempotency key; the response includes request/transfer ids, the lifecycle `flowId`, resolved destination, and status.
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
     * Reads an accepted transfer of the resolved source account by exactly one of `requestId` or
     * `transferId`, and returns both IDs, the lifecycle `flowId` and the acceptance time. Use it
     * to reconcile a transfer without resubmitting it; pass `flowId` to `lifecycle.getFlow`,
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
