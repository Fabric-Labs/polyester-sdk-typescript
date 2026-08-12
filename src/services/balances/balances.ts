import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { publicationHandlerErrorContext } from "../../shared/subscription-errors.js";
import * as v from "../../shared/validation.js";
import type { PolyesterRealtime } from "../../realtime/index.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { accountScopeToSubaccountId, type AccountScopedInput } from "../../shared/account-scope.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { createReadyGate, type SdkScales } from "../../shared/decimal-surface.js";
import {
    BalanceHistoryInputSchema,
    BalancesListInputSchema,
    EquityHistoryInputSchema,
    createBalanceHistoryResponseSchema,
    createEquityHistoryResponseSchema,
    createLedgerBalanceSchema,
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
    #realtime: PolyesterRealtime;
    #resolver?: SubaccountResolver;
    #scales: SdkScales;
    #ledgerBalanceSchema: ReturnType<typeof createLedgerBalanceSchema>;
    #balanceHistoryResponseSchema: ReturnType<typeof createBalanceHistoryResponseSchema>;
    #equityHistoryResponseSchema: ReturnType<typeof createEquityHistoryResponseSchema>;

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
        this.#ledgerBalanceSchema = createLedgerBalanceSchema();
        this.#balanceHistoryResponseSchema = createBalanceHistoryResponseSchema();
        this.#equityHistoryResponseSchema = createEquityHistoryResponseSchema(scales);
    }

    /**
     * Returns current asset balances for the resolved root account or subaccount, including trading, funding, reserved, and available amounts as decimal strings.
     */
    async list(
        input: AccountScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<LedgerBalance[]> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = v.parse(BalancesListInputSchema, resolved);
        const res = await this.#client.getBalances(
            {
                subaccountId: accountScopeToSubaccountId(validated.account),
            },
            toConnectCallOptions(options),
        );
        return v.parse(v.array(this.#ledgerBalanceSchema), res.balances);
    }

    /**
     * Returns columnar balance history for the resolved account scope over a selected range, optionally filtered by a non-negative integer ledger asset ID and account buckets. Ledger 0 or omission includes all assets.
     */
    async getBalanceHistory(
        input: BalanceHistoryInput,
        options?: PolyesterRequestOptions,
    ): Promise<BalanceHistoryResponse> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = v.parse(BalanceHistoryInputSchema, resolved);
        const res = await this.#client.getBalanceHistory(validated, toConnectCallOptions(options));
        return v.parse(this.#balanceHistoryResponseSchema, res);
    }

    /**
     * Returns equity history series for the resolved account scope over a selected range, optionally grouped by account or asset and filtered by account buckets.
     */
    async getEquityHistory(
        input: EquityHistoryInput,
        options?: PolyesterRequestOptions,
    ): Promise<EquityHistoryResponse> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = v.parse(EquityHistoryInputSchema, resolved);
        const res = await this.#client.getEquityHistorySeries(
            validated,
            toConnectCallOptions(options),
        );
        return v.parse(this.#equityHistoryResponseSchema, res);
    }

    /**
     * Subscribes to private balance updates on private:ledger:balances:{accountId}:proto and emits every balance record as a decimal-string row. Records for assets unknown to the catalog route a CatalogLookupError to onError.
     */
    subscribe(input: SubscribeBalancesInput): () => void {
        const channel = `private:ledger:balances:${input.accountId}:proto`;
        const gate = createReadyGate(
            () => this.#scales.ready(),
            (error) => input.onError?.(publicationHandlerErrorContext(channel, error)),
        );
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.AssetBalanceSchema,
            onPublication: (data) => {
                gate.run(() => {
                    const b = v.parse(this.#ledgerBalanceSchema, data);
                    input.onEvent(b);
                });
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
