import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { createClient, type Client } from "@connectrpc/connect";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import type { PolyesterRealtime } from "../../realtime/index.js";
import { connectReadyGatedProtoChannel } from "../../realtime/ready-gated-subscription.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { accountScopeToSubaccountId, type AccountScopedInput } from "../../shared/account-scope.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import {
    BalanceHistoryInputSchema,
    BalancesListInputSchema,
    EquityHistoryInputSchema,
    PortfolioEquityHistoryInputSchema,
    createBalanceHistoryResponseSchema,
    createEquityHistoryResponseSchema,
    createLedgerBalanceSchema,
    createPortfolioEquityHistoryResponseSchema,
    createPortfolioEquitySnapshotResponseSchema,
    type LedgerBalance,
    type BalanceHistoryInput,
    type BalanceHistoryResponse,
    type EquityHistoryInput,
    type EquityHistoryResponse,
    type PortfolioEquityHistoryInput,
    type PortfolioEquityHistoryResponse,
    type PortfolioEquitySnapshotResponse,
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
    #portfolioEquityHistoryResponseSchema: ReturnType<
        typeof createPortfolioEquityHistoryResponseSchema
    >;
    #portfolioEquitySnapshotResponseSchema: ReturnType<
        typeof createPortfolioEquitySnapshotResponseSchema
    >;

    constructor(
        transports: AuthApiTransports,
        realtime: PolyesterRealtime,
        resolver: SubaccountResolver | undefined,
        scales: SdkScales,
    ) {
        this.#client = createClient(Proto.LedgerReadService, transports.authApi);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#scales = scales;
        this.#ledgerBalanceSchema = createLedgerBalanceSchema();
        this.#balanceHistoryResponseSchema = createBalanceHistoryResponseSchema();
        this.#equityHistoryResponseSchema = createEquityHistoryResponseSchema(scales);
        this.#portfolioEquityHistoryResponseSchema =
            createPortfolioEquityHistoryResponseSchema(scales);
        this.#portfolioEquitySnapshotResponseSchema =
            createPortfolioEquitySnapshotResponseSchema(scales);
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
        const validated = parse(BalancesListInputSchema, resolved);
        const res = await this.#client.getBalances(
            {
                subaccountId: accountScopeToSubaccountId(validated.account),
            },
            toConnectCallOptions(options),
        );
        return parse(v.array(this.#ledgerBalanceSchema), res.balances);
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
        const validated = parse(BalanceHistoryInputSchema, resolved);
        const res = await this.#client.getBalanceHistory(validated, toConnectCallOptions(options));
        return parse(this.#balanceHistoryResponseSchema, res);
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
        const validated = parse(EquityHistoryInputSchema, resolved);
        const res = await this.#client.getEquityHistorySeries(
            validated,
            toConnectCallOptions(options),
        );
        return parse(this.#equityHistoryResponseSchema, res);
    }

    /**
     * Returns root portfolio equity history grouped by the master account, leading owned subaccounts, and an optional remaining-subaccounts series.
     */
    async getPortfolioEquityHistory(
        input: PortfolioEquityHistoryInput,
        options?: PolyesterRequestOptions,
    ): Promise<PortfolioEquityHistoryResponse> {
        await this.#scales.ready();
        const validated = parse(PortfolioEquityHistoryInputSchema, input);
        const res = await this.#client.getPortfolioEquityHistorySeries(
            validated,
            toConnectCallOptions(options),
        );
        return parse(this.#portfolioEquityHistoryResponseSchema, res);
    }

    /**
     * Returns current root portfolio equity grouped by logical account and asset.
     */
    async getPortfolioEquitySnapshot(
        options?: PolyesterRequestOptions,
    ): Promise<PortfolioEquitySnapshotResponse> {
        await this.#scales.ready();
        const res = await this.#client.getPortfolioEquitySnapshot(
            {},
            toConnectCallOptions(options),
        );
        return parse(this.#portfolioEquitySnapshotResponseSchema, res);
    }

    /**
     * Subscribes to private balance updates on private:ledger:balances:{accountId}:proto and emits every balance record as a decimal-string row. Records for assets unknown to the catalog route a CatalogLookupError to onError.
     */
    subscribe(input: SubscribeBalancesInput): () => void {
        const channel = `private:ledger:balances:${input.accountId}:proto`;
        return connectReadyGatedProtoChannel(this.#realtime, {
            channel,
            schema: Proto.AssetBalanceSchema,
            ready: () => this.#scales.ready(),
            onPublication: (data) => {
                const b = parse(this.#ledgerBalanceSchema, data);
                input.onEvent(b);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
