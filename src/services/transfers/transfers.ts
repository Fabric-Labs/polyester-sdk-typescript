import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import type { RealtimeClient } from "../../realtime/index.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import {
    createTransfersSchemas,
    ListTransfersInputSchema,
    type LedgerTransfer,
    type ListTransfersInput,
} from "./transfers.schemas.js";
import { staticCatalog, type CatalogReader } from "../../catalogs/index.js";

interface SubscribeTransfersInput extends BaseSubscribeInput<LedgerTransfer> {
    accountId: string;
}

/**
 * Reads and streams ledger transfer activity for the authenticated account scope.
 */
export class TransfersService {
    #client: Client<typeof Proto.LedgerReadService>;
    #realtime: RealtimeClient;
    #resolver?: SubaccountResolver;
    #schemas: ReturnType<typeof createTransfersSchemas>;

    constructor(
        transport: Transport,
        realtime: RealtimeClient,
        resolver?: SubaccountResolver,
        catalog: CatalogReader = staticCatalog,
    ) {
        this.#client = createClient(Proto.LedgerReadService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#schemas = createTransfersSchemas(catalog);
    }

    /**
     * Returns ledger transfers for the resolved account scope with limit, direction, timestamp, code, ledger, and cursor filters. The proto nextCursor is converted to null when no further page is available.
     */
    async list(
        input: ListTransfersInput,
        options?: PolyesterRequestOptions,
    ): Promise<{ transfers: LedgerTransfer[]; nextCursor: number | null }> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(ListTransfersInputSchema, resolved);
        const res = await this.#client.listTransfers(validatedInput, toConnectCallOptions(options));
        const schemas = this.#schemas.current();
        const transfers = v.parse(v.array(schemas.ledgerTransfer), res.transfers);
        const nextCursor = Number(res.nextCursor ?? 0n) || null;
        return { transfers, nextCursor };
    }

    /**
     * Subscribes to private ledger transfer updates on private:ledger:transfers:{accountId}:proto and emits parsed transfer rows.
     */
    subscribe(input: SubscribeTransfersInput): () => void {
        const channel = `private:ledger:transfers:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.TransferRowSchema,
            onPublication: (m) => {
                const schemas = this.#schemas.current();
                const tr = v.parse(schemas.ledgerTransfer, m);
                input.onEvent(tr);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
