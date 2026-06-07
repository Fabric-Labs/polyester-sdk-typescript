import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/transfer/v1/internal_transfer_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { stepUpCallOptions } from "../../utils/step-up-call-options.js";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
import * as v from "valibot";
import {
    CreateInternalTransferInputSchema,
    CreateInternalTransferResultSchema,
    type CreateInternalTransferInput,
    type CreateInternalTransferResult,
} from "./internal-transfers.schemas.js";

export type InternalTransferMutationOptions = {
    stepUpToken?: string | null;
};

export class InternalTransfersService {
    #client: Client<typeof Proto.InternalTransferService>;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.InternalTransferService, transport);
        this.#resolver = resolver;
    }

    async create(
        input: CreateInternalTransferInput,
        options?: InternalTransferMutationOptions,
    ): Promise<CreateInternalTransferResult> {
        const resolvedInput = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(CreateInternalTransferInputSchema, resolvedInput);
        const res = await this.#client.createInternalTransfer(
            removeUndefined(validatedInput),
            stepUpCallOptions(options?.stepUpToken),
        );
        return v.parse(CreateInternalTransferResultSchema, res);
    }
}
