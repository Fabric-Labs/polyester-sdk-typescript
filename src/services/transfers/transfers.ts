import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import { connectProtoChannel } from "../../realtime/index.js";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
	LedgerTransferSchema,
	ListTransfersInputSchema,
	type LedgerTransfer,
	type ListTransfersInput,
} from "./transfers.schemas.js";

interface SubscribeTransfersInput extends BaseSubscribeInput<LedgerTransfer> {
	accountId: string;
}

export class TransfersService {
	#client: Client<typeof Proto.LedgerReadService>;
	#resolver?: SubAccountResolver;

	constructor(transport: Transport, resolver?: SubAccountResolver) {
		this.#client = createClient(Proto.LedgerReadService, transport);
		this.#resolver = resolver;
	}

	async list(
		input: ListTransfersInput
	): Promise<{ transfers: LedgerTransfer[]; nextCursor: number | null }> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validatedInput = ListTransfersInputSchema.parse(resolved);
		const res = await this.#client.listTransfers(validatedInput);
		const transfers = z.array(LedgerTransferSchema).parse(res.transfers);
		const nextCursor = Number(res.nextCursor ?? 0n) || null;
		return { transfers, nextCursor };
	}

	subscribe(input: SubscribeTransfersInput): () => void {
		const channel = `private:ledger:transfers:${input.accountId}:proto`;
		return connectProtoChannel({
			channel,
			schema: Proto.TransferRowSchema,
			onPublication: (m) => {
				const tr = LedgerTransferSchema.parse(m);
				input.onEvent(tr);
			},
			onConnected: input.onOpen,
			onDisconnected: input.onClose,
		});
	}
}
