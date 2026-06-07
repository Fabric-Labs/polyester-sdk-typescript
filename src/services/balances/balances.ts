import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import type { RealtimeClient } from "../../realtime/index.js";
import {
    type SubaccountResolver,
    resolveSubaccountId,
    resolveSubaccountScopedInput,
} from "../subaccount-resolver.js";
import { idToBigInt } from "../../utils/base58-id.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    LedgerBalanceSchema,
    BalanceHistoryInputSchema,
    BalanceHistoryResponseSchema,
    EquityHistoryInputSchema,
    EquityHistoryResponseSchema,
    type LedgerBalance,
    type BalanceHistoryInput,
    type BalanceHistoryResponse,
    type EquityHistoryInput,
    type EquityHistoryResponse,
} from "./balances.schemas.js";
import { isKnownAssetId } from "../../catalogs/ledger-catalog.js";

interface SubscribeBalancesInput extends BaseSubscribeInput<LedgerBalance> {
    accountId: string;
}

export class BalancesService {
    #client: Client<typeof Proto.LedgerReadService>;
    #realtime: RealtimeClient;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, realtime: RealtimeClient, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.LedgerReadService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    async list(input: { subaccountId?: string } = {}): Promise<LedgerBalance[]> {
        const resolved = resolveSubaccountId(input.subaccountId, this.#resolver);
        const res = await this.#client.getBalances({
            subaccountId: resolved ? idToBigInt(resolved, "subaccountId") : undefined,
        });
        return v.parse(
            v.array(LedgerBalanceSchema),
            res.balances.filter((b) => isKnownAssetId(b.assetId)),
        );
    }

    async getBalanceHistory(input: BalanceHistoryInput): Promise<BalanceHistoryResponse> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(BalanceHistoryInputSchema, resolved);
        const res = await this.#client.getBalanceHistory(validated);
        return v.parse(BalanceHistoryResponseSchema, res);
    }

    async getEquityHistory(
        input: EquityHistoryInput,
        options: { signal?: AbortSignal } = {},
    ): Promise<EquityHistoryResponse> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(EquityHistoryInputSchema, resolved);
        const res = await this.#client.getEquityHistorySeries(validated, {
            signal: options.signal,
        });
        return v.parse(EquityHistoryResponseSchema, res);
    }

    subscribe(input: SubscribeBalancesInput): () => void {
        const channel = `private:ledger:balances:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.AssetBalanceSchema,
            onPublication: (data) => {
                if (!isKnownAssetId(data.assetId)) return;
                const b = v.parse(LedgerBalanceSchema, data);
                input.onEvent(b);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
        });
    }
}
