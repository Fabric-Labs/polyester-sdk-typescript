import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/exchange/transfer/v1/internal_transfer_pb.js";
import type { LocalMockRuntime } from "../../mock/local-mock-runtime.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { stepUpCallOptions } from "../../utils/step-up-call-options.js";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
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
	#resolver?: SubAccountResolver;
	#localMock?: LocalMockRuntime;

	constructor(transport: Transport, resolver?: SubAccountResolver, localMock?: LocalMockRuntime) {
		this.#client = createClient(Proto.InternalTransferService, transport);
		this.#resolver = resolver;
		this.#localMock = localMock;
	}

	async create(
		input: CreateInternalTransferInput,
		options?: InternalTransferMutationOptions
	): Promise<CreateInternalTransferResult> {
		this.#localMock?.assertMutationAllowed("internalTransfers.create");
		const resolvedInput = resolveSubAccountScopedInput(input, this.#resolver);
		const validatedInput = CreateInternalTransferInputSchema.parse(resolvedInput);
		const res = await this.#client.createInternalTransfer(
			removeUndefined(validatedInput),
			stepUpCallOptions(options?.stepUpToken)
		);
		return CreateInternalTransferResultSchema.parse(res);
	}
}
