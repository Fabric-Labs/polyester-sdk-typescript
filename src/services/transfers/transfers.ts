import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import { connectProtoChannel } from "../../realtime";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver";
import type { BaseSubscribeInput } from "../../shared/types";
import {
	LedgerTransferSchema,
	ListTransfersInputSchema,
	type LedgerTransfer,
	type ListTransfersInput,
} from "./transfers.schemas";
import { createLocalMockNoopSubscription } from "../../mock/local-mock-subscription";
import type { LocalMockRuntime } from "../../mock/local-mock-runtime";
import { EMPTY_TRANSFERS_RESULT } from "../../mock/polyester-mock-world";

interface SubscribeTransfersInput extends BaseSubscribeInput<LedgerTransfer> {
	accountId: string;
}

export class TransfersService {
	#client: Client<typeof Proto.LedgerReadService>;
	#resolver?: SubAccountResolver;
	#localMock?: LocalMockRuntime;

	constructor(transport: Transport, resolver?: SubAccountResolver, localMock?: LocalMockRuntime) {
		this.#client = createClient(Proto.LedgerReadService, transport);
		this.#resolver = resolver;
		this.#localMock = localMock;
	}

	async list(
		input: ListTransfersInput
	): Promise<{ transfers: LedgerTransfer[]; nextCursor: number | null }> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		if (this.#localMock?.isEnabled()) return { ...EMPTY_TRANSFERS_RESULT };
		const validatedInput = ListTransfersInputSchema.parse(resolved);
		const res = await this.#client.listTransfers(validatedInput);
		const transfers = z.array(LedgerTransferSchema).parse(res.transfers);
		const nextCursor = Number(res.nextCursor ?? 0n) || null;
		return { transfers, nextCursor };
	}

	subscribe(input: SubscribeTransfersInput): () => void {
		if (this.#localMock?.isEnabled()) {
			return createLocalMockNoopSubscription(input);
		}
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
