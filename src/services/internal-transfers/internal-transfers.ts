import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/transfer/v1/internal_transfer_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
} from "../../shared/request-options.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import * as v from "valibot";
import {
    CreateInternalTransferInputSchema,
    CreateInternalTransferResultSchema,
    type CreateInternalTransferInput,
    type CreateInternalTransferResult,
} from "./internal-transfers.schemas.js";

/**
 * Creates authenticated Trading-to-Trading internal transfer requests.
 */
export class InternalTransfersService {
    #client: Client<typeof Proto.InternalTransferService>;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.InternalTransferService, transport);
        this.#resolver = resolver;
    }

    /**
     * Creates or returns an idempotent internal transfer from the resolved source account to a destination root account, subaccount, or smart-account address. The request carries asset id, scaled quantity, and a stable idempotency key; the response includes request/transfer ids, resolved destination, and status.
     */
    async create(
        input: CreateInternalTransferInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateInternalTransferResult> {
        const resolvedInput = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(CreateInternalTransferInputSchema, resolvedInput);
        const res = await this.#client.createInternalTransfer(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return v.parse(CreateInternalTransferResultSchema, res);
    }
}
