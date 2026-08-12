import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/transfer/v1/internal_transfer_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
} from "../../shared/request-options.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import * as v from "../../shared/validation.js";
import {
    createCreateInternalTransferInputSchema,
    createCreateInternalTransferResultSchema,
    type CreateInternalTransferInput,
    type CreateInternalTransferResult,
} from "./internal-transfers.schemas.js";

/**
 * Creates authenticated Trading-to-Trading internal transfer requests.
 */
export class InternalTransfersService {
    #client: Client<typeof Proto.InternalTransferService>;
    #resolver?: SubaccountResolver;
    #scales: SdkScales;
    #inputSchema: ReturnType<typeof createCreateInternalTransferInputSchema>;
    #resultSchema: ReturnType<typeof createCreateInternalTransferResultSchema>;

    constructor(transport: Transport, resolver: SubaccountResolver | undefined, scales: SdkScales) {
        this.#client = createClient(Proto.InternalTransferService, transport);
        this.#resolver = resolver;
        this.#scales = scales;
        this.#inputSchema = createCreateInternalTransferInputSchema(scales);
        this.#resultSchema = createCreateInternalTransferResultSchema();
    }

    /**
     * Creates or returns an idempotent internal transfer from the resolved source account to a destination root account, subaccount, or smart-account address. The request carries asset id, a decimal quantity, and a stable idempotency key; the response includes request/transfer ids, resolved destination, and status.
     */
    async create(
        input: CreateInternalTransferInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateInternalTransferResult> {
        await this.#scales.ready();
        const resolvedInput = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(this.#inputSchema, resolvedInput);
        const res = await this.#client.createInternalTransfer(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return v.parse(this.#resultSchema, res);
    }
}
