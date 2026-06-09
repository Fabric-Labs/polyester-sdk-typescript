import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import type { RealtimeClient } from "../../realtime/index.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { accountScopeToSubaccountId, type AccountScopedInput } from "../../shared/account-scope.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    BalanceHistoryInputSchema,
    BalanceHistoryResponseSchema,
    EquityHistoryInputSchema,
    EquityHistoryResponseSchema,
    LedgerBalanceSchema,
    type LedgerBalance,
    type BalanceHistoryInput,
    type BalanceHistoryResponse,
    type EquityHistoryInput,
    type EquityHistoryResponse,
} from "./balances.schemas.js";

interface SubscribeBalancesInput extends BaseSubscribeInput<LedgerBalance> {
    accountId: string;
}

/**
 * Reads and streams ledger balances plus balance and equity history for the authenticated account scope.
 */
export class BalancesService {
    #client: Client<typeof Proto.LedgerReadService>;
    #realtime: RealtimeClient;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, realtime: RealtimeClient, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.LedgerReadService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    /**
     * Returns current asset balances for the resolved root account or subaccount, including trading, funding, reserved, and available amounts. Unknown asset ids are filtered out before schema parsing.
     */
    async list(
        input: AccountScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<LedgerBalance[]> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const res = await this.#client.getBalances(
            {
                subaccountId: accountScopeToSubaccountId(resolved.account),
            },
            toConnectCallOptions(options),
        );
        return v.parse(v.array(LedgerBalanceSchema), res.balances);
    }

    /**
     * Returns columnar balance history for the resolved account scope over a selected range, optionally filtered by ledger asset and account buckets.
     */
    async getBalanceHistory(
        input: BalanceHistoryInput,
        options?: PolyesterRequestOptions,
    ): Promise<BalanceHistoryResponse> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = v.parse(BalanceHistoryInputSchema, resolved);
        const res = await this.#client.getBalanceHistory(validated, toConnectCallOptions(options));
        return v.parse(BalanceHistoryResponseSchema, res);
    }

    /**
     * Returns equity history series for the resolved account scope over a selected range, optionally grouped by account or asset and filtered by account buckets.
     */
    async getEquityHistory(
        input: EquityHistoryInput,
        options?: PolyesterRequestOptions,
    ): Promise<EquityHistoryResponse> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = v.parse(EquityHistoryInputSchema, resolved);
        const res = await this.#client.getEquityHistorySeries(
            validated,
            toConnectCallOptions(options),
        );
        return v.parse(EquityHistoryResponseSchema, res);
    }

    /**
     * Subscribes to private balance updates on private:ledger:balances:{accountId}:proto and emits known-asset balance records only.
     */
    subscribe(input: SubscribeBalancesInput): () => void {
        const channel = `private:ledger:balances:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.AssetBalanceSchema,
            onPublication: (data) => {
                const b = v.parse(LedgerBalanceSchema, data);
                input.onEvent(b);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
