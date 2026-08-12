import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { publicationHandlerErrorContext } from "../../shared/subscription-errors.js";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import type { PolyesterRealtime } from "../../realtime/index.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { createReadyGate, type SdkScales } from "../../shared/decimal-surface.js";
import {
    createLedgerTransferSchema,
    ListTransfersInputSchema,
    type LedgerTransfer,
    type ListTransfersInput,
} from "./transfers.schemas.js";

interface SubscribeTransfersInput extends BaseSubscribeInput<LedgerTransfer> {
    accountId: string;
}

/**
 * Reads and streams ledger transfer activity for the authenticated account scope.
 */
export class TransfersService {
    #client: Client<typeof Proto.LedgerReadService>;
    #realtime: PolyesterRealtime;
    #resolver?: SubaccountResolver;
    #scales: SdkScales;
    #ledgerTransferSchema: ReturnType<typeof createLedgerTransferSchema>;

    constructor(
        transport: Transport,
        realtime: PolyesterRealtime,
        resolver: SubaccountResolver | undefined,
        scales: SdkScales,
    ) {
        this.#client = createClient(Proto.LedgerReadService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#scales = scales;
        this.#ledgerTransferSchema = createLedgerTransferSchema(scales);
    }

    /**
     * Returns ledger transfers for the resolved account scope with limit, direction, timestamp, code, ledger, and page-token filters.
     */
    async list(
        input: ListTransfersInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ transfers: LedgerTransfer[]; nextPageToken: string }> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = parse(ListTransfersInputSchema, resolved);
        const res = await this.#client.listTransfers(validatedInput, toConnectCallOptions(options));
        const transfers = parse(v.array(this.#ledgerTransferSchema), res.transfers);
        return { transfers, nextPageToken: res.nextPageToken };
    }

    /**
     * Subscribes to private ledger transfer updates on private:ledger:transfers:{accountId}:proto and emits parsed transfer rows.
     */
    subscribe(input: SubscribeTransfersInput): () => void {
        const channel = `private:ledger:transfers:${input.accountId}:proto`;
        const gate = createReadyGate(
            () => this.#scales.ready(),
            (error) => input.onError?.(publicationHandlerErrorContext(channel, error)),
        );
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.TransferRowSchema,
            onPublication: (m) => {
                gate.run(() => {
                    const tr = parse(this.#ledgerTransferSchema, m);
                    input.onEvent(tr);
                });
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
