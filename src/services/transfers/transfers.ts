import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import type { RealtimeClient } from "../../realtime/index.js";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
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
    #realtime: RealtimeClient;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, realtime: RealtimeClient, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.LedgerReadService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    async list(
        input: ListTransfersInput,
    ): Promise<{ transfers: LedgerTransfer[]; nextCursor: number | null }> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(ListTransfersInputSchema, resolved);
        const res = await this.#client.listTransfers(validatedInput);
        const transfers = v.parse(v.array(LedgerTransferSchema), res.transfers);
        const nextCursor = Number(res.nextCursor ?? 0n) || null;
        return { transfers, nextCursor };
    }

    subscribe(input: SubscribeTransfersInput): () => void {
        const channel = `private:ledger:transfers:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.TransferRowSchema,
            onPublication: (m) => {
                const tr = v.parse(LedgerTransferSchema, m);
                input.onEvent(tr);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
        });
    }
}
