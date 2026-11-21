import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/pnl/v1/pnl_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import {
    GetProfitAndLossInputSchema,
    GetTradingStatisticsInputSchema,
    ListDailyProfitAndLossInputSchema,
    ListDailyProfitAndLossResultSchema,
    ProfitAndLossSchema,
    TradingStatisticsSchema,
    type GetProfitAndLossInput,
    type GetTradingStatisticsInput,
    type ListDailyProfitAndLossInput,
    type ListDailyProfitAndLossResult,
    type ProfitAndLoss,
    type TradingStatistics,
} from "./profit-and-loss.schemas.js";

/**
 * Reads the account's profit and loss in USD. Spot PnL uses each asset's weighted average cost;
 * every trade is valued at its execution time and every fee is a realized expense. Deposits,
 * withdrawals and transfers are never PnL. API keys need `read-pnl`.
 */
export class ProfitAndLossService {
    #client: Client<typeof Proto.ProfitAndLossService>;
    #resolver?: SubaccountResolver;

    constructor(transports: AuthApiTransports, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.ProfitAndLossService, transports.authApi);
        this.#resolver = resolver;
    }

    /** Returns PnL over a window by product and market, and current holdings with unrealized PnL. */
    async get(
        input: GetProfitAndLossInput,
        options?: PolyesterRequestOptions,
    ): Promise<ProfitAndLoss> {
        const request = parse(
            GetProfitAndLossInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.getProfitAndLoss(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(ProfitAndLossSchema, response);
    }

    /** Lists PnL per UTC day, oldest first, with each day's start and end equity and net flow. */
    async listDaily(
        input: ListDailyProfitAndLossInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListDailyProfitAndLossResult> {
        const request = parse(
            ListDailyProfitAndLossInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.listDailyProfitAndLoss(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(ListDailyProfitAndLossResultSchema, response);
    }

    /**
     * Returns trade count, volume, fees and realized PnL over a window, with the time-weighted
     * return, maximum drawdown and Sharpe ratio of its closed days.
     */
    async getTradingStatistics(
        input: GetTradingStatisticsInput,
        options?: PolyesterRequestOptions,
    ): Promise<TradingStatistics> {
        const request = parse(
            GetTradingStatisticsInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.getTradingStatistics(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(TradingStatisticsSchema, response);
    }
}
