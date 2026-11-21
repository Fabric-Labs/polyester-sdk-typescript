import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { createClient, type Client } from "@connectrpc/connect";
import { parse } from "../../shared/validation.js";
import type { PolyesterRealtime } from "../../realtime/index.js";
import { createSdkSubscriptionErrorContext } from "../../shared/subscription-errors.js";
import { createBalanceSync, type LedgerBalancesEvent } from "./balances.sync.js";
import {
    type SubaccountResolver,
    resolveAccountScope,
    resolveAccountScopedInput,
} from "../subaccount-resolver.js";
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
    formatLedgerBalanceSnapshot,
    formatLedgerBalanceUpdate,
    createPortfolioEquityHistoryResponseSchema,
    createPortfolioEquitySnapshotResponseSchema,
    type LedgerBalance,
    type LedgerBalanceSnapshot,
    type BalanceHistoryInput,
    type BalanceHistoryResponse,
    type EquityHistoryInput,
    type EquityHistoryResponse,
    type PortfolioEquityHistoryInput,
    type PortfolioEquityHistoryResponse,
    type PortfolioEquitySnapshotResponse,
} from "./balances.schemas.js";

interface SubscribeBalancesInput extends BaseSubscribeInput<LedgerBalancesEvent> {
    accountId: string;
    /** The account scope `accountId` names, for the snapshot; omit for the default scope. */
    account?: AccountScopedInput["account"];
}

/**
 * Reads and streams ledger balances plus balance and equity history for the authenticated account scope.
 */
export class BalancesService {
    #client: Client<typeof Proto.LedgerReadService>;
    #realtime: PolyesterRealtime;
    #resolver?: SubaccountResolver;
    #scales: SdkScales;
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
        return (await this.getSnapshot(input, options)).balances;
    }

    /**
     * Like `list`, plus the position (`tradingEpoch`, `tradingSequence`) the Trading values are at,
     * which seeds the balance stream: apply its Trading updates of that epoch from the next sequence
     * on. Throws `ServiceUnavailableError` while it cannot answer at a current position yet; retry
     * it with a short backoff.
     */
    async getSnapshot(
        input: AccountScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<LedgerBalanceSnapshot> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = parse(BalancesListInputSchema, resolved);
        const res = await this.#client.getBalances(
            {
                subaccountId: accountScopeToSubaccountId(validated.account),
            },
            toConnectCallOptions(options),
        );
        return formatLedgerBalanceSnapshot(res);
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
     * Keeps the account's balances exact from private:ledger:balances:{accountId}:proto and emits
     * the whole balance list after each change: a `snapshot` on every (re)subscribe, then each
     * complete Trading step in sequence and each newer Funding balance. Repeats and stale epochs
     * are dropped; a new epoch, a sequence gap or a Trading step stalled for 2 seconds reloads the
     * snapshot. `account` selects the snapshot and must name the same account as `accountId`;
     * omit it for the default account scope. A failed snapshot is reported to `onError` and
     * retried while it is retryable.
     */
    subscribe(input: SubscribeBalancesInput): () => void {
        const channel = `private:ledger:balances:${input.accountId}:proto`;
        const resolved = resolveAccountScope(input.account, this.#resolver);
        const account = resolved === undefined ? "main" : resolved;
        const report = (type: string, error: unknown) => {
            try {
                input.onError?.(createSdkSubscriptionErrorContext(channel, type, error));
            } catch {
                // A throwing error handler must not break the sync.
            }
        };
        const sync = createBalanceSync({
            // Pinned now: the channel is fixed to `accountId`, so a later account switch must not
            // re-resolve the snapshot's scope.
            fetchSnapshot: () => this.getSnapshot({ account }),
            isConnected: () => this.#realtime.connection.private.state !== "disconnected",
            emit: (event) => {
                try {
                    input.onEvent(event);
                } catch (error) {
                    report("publication_handler", error);
                }
            },
            onSnapshotError: (error) => report("snapshot", error),
        });
        // Logout drops the channel without `onDisconnected` but marks the socket `disconnected`
        // (a reconnect only passes through `connecting`). Watch for that only while subscribed,
        // so a channel logout dropped keeps no listener; `onConnected` watches again on a restart.
        let unwatch: (() => void) | undefined;
        const stopWatching = () => {
            unwatch?.();
            unwatch = undefined;
        };
        const unsubscribe = this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.BalanceUpdateSchema,
            onPublication: (data) => {
                let update;
                try {
                    update = formatLedgerBalanceUpdate(data);
                } catch (error) {
                    return report("publication_handler", error);
                }
                sync.update(update);
            },
            onConnected: () => {
                unwatch ??= this.#realtime.onConnectionChange((connection) => {
                    if (connection.private.state !== "disconnected") return;
                    sync.disconnected();
                    stopWatching();
                });
                sync.connected();
                input.onOpen?.();
            },
            onDisconnected: () => {
                stopWatching();
                sync.disconnected();
                input.onClose?.();
            },
            onError: input.onError,
        });
        return () => {
            stopWatching();
            sync.dispose();
            unsubscribe();
        };
    }
}
