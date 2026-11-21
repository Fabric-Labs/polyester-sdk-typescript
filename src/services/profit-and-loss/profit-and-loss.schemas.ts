import * as v from "valibot";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import { BigIntStringSchema, TimestampMsSchema } from "../../shared/schemas.js";
import { PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
import { msToTimestamp } from "../../utils/timestamp.js";
import { SymbolIdInputSchema } from "../shared.js";
import {
    PROFIT_AND_LOSS_PRODUCT_VALUES,
    PROFIT_AND_LOSS_WINDOW_VALUES,
    ProfitAndLossNoticeCodec,
    ProfitAndLossProductCodec,
    ProfitAndLossWindowCodec,
} from "./profit-and-loss.codecs.js";

const PeriodInputEntries = {
    /**
     * Defaults to the active subaccount. With none, or with `"main"`, a session or main-account
     * API key reads the main account together with every subaccount it owns; a subaccount API
     * key reads its own subaccount.
     */
    ...AccountScopeInputEntries,
    window: v.picklist(PROFIT_AND_LOSS_WINDOW_VALUES),
    /** Only this product; omit for every product. */
    product: v.optional(v.picklist(PROFIT_AND_LOSS_PRODUCT_VALUES)),
    /** Only this market; omit for every market. */
    symbolId: v.optional(SymbolIdInputSchema),
};

function periodInputSchema() {
    return v.pipe(
        v.strictObject(PeriodInputEntries),
        v.transform(({ account, window, product, ...input }) => ({
            ...input,
            subaccountId: accountScopeToSubaccountId(account),
            window: ProfitAndLossWindowCodec.inputToProto[window],
            product: product && ProfitAndLossProductCodec.inputToProto[product],
        })),
    );
}

/** `symbolId` filters `markets` only; totals and holdings cover every market. */
export const GetProfitAndLossInputSchema = periodInputSchema();
export type GetProfitAndLossInput = v.InferInput<typeof GetProfitAndLossInputSchema>;

/** The return figures cover the whole account, whatever `product` and `symbolId` select. */
export const GetTradingStatisticsInputSchema = periodInputSchema();
export type GetTradingStatisticsInput = v.InferInput<typeof GetTradingStatisticsInputSchema>;

export const ListDailyProfitAndLossInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        /** First day, inclusive: 00:00 UTC of a day, in epoch milliseconds. */
        startTime: v.pipe(v.number(), v.integer()),
        /** Day after the last one, exclusive: 00:00 UTC, at most 366 days after `startTime`. */
        endTime: v.pipe(v.number(), v.integer()),
        /** Days per page; 0 or omitted means 31, at most 366. */
        limit: v.optional(
            v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(PROTOBUF_UINT32_MAX)),
        ),
        /** Previous `nextPageToken`; reuse only with the same account and days. */
        pageToken: v.optional(v.string()),
    }),
    v.transform(({ account, startTime, endTime, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
        startTime: msToTimestamp(startTime),
        endTime: msToTimestamp(endTime),
    })),
);
export type ListDailyProfitAndLossInput = v.InferInput<typeof ListDailyProfitAndLossInputSchema>;

/** Omitted on the wire when a price it needs is not available; never reported as `"0"`. */
const OptionalDecimalSchema = v.optional(v.nullable(v.string()), null);
const ProductOutputSchema = enumLabelSchema(ProfitAndLossProductCodec.protoToOutput);
const NoticesSchema = v.array(enumLabelSchema(ProfitAndLossNoticeCodec.protoToOutput));

/** USD amounts and quantities are decimal strings; signed unless noted. */
export const ProductProfitAndLossSchema = v.object({
    product: ProductOutputSchema,
    /** Realized PnL of the period's trades, after fees. */
    realizedPnlUsd: v.string(),
    /** Fees net of rebates; negative when rebates exceed fees. */
    feesUsd: v.string(),
    /** Non-negative. */
    volumeUsd: v.string(),
});
export type ProductProfitAndLoss = v.InferOutput<typeof ProductProfitAndLossSchema>;

export const MarketProfitAndLossSchema = v.object({
    symbolId: v.number(),
    ...ProductProfitAndLossSchema.entries,
    tradeCount: BigIntStringSchema,
});
export type MarketProfitAndLoss = v.InferOutput<typeof MarketProfitAndLossSchema>;

/** An asset held now. Quantities are in whole units of the asset. */
export const HoldingProfitAndLossSchema = v.object({
    assetId: v.number(),
    /** Quantity held: the quantity with a known cost plus `untrackedQuantity`. */
    positionQuantity: v.string(),
    /** Quantity of unknown cost, such as deposited coins; never counts toward PnL. */
    untrackedQuantity: v.string(),
    /** USD cost of the quantity with a known cost. */
    costUsd: v.string(),
    /** Null when no quantity has a known cost. */
    entryPriceUsd: OptionalDecimalSchema,
    markPriceUsd: OptionalDecimalSchema,
    /** Null when `markPriceUsd` is. */
    unrealizedPnlUsd: OptionalDecimalSchema,
});
export type HoldingProfitAndLoss = v.InferOutput<typeof HoldingProfitAndLossSchema>;

/** Times are epoch milliseconds (UTC); a null figure needs a price that is not available. */
export const ProfitAndLossSchema = v.object({
    windowStart: TimestampMsSchema,
    /** When the figures were last published; trades settled just before may be missing. */
    asOf: TimestampMsSchema,
    /** Time of the prices that value holdings now. */
    markTime: TimestampMsSchema,
    /** `realizedPnlUsd` plus `unrealizedPnlChangeUsd`; transfers are neutral. */
    pnlUsd: OptionalDecimalSchema,
    realizedPnlUsd: v.string(),
    unrealizedPnlChangeUsd: OptionalDecimalSchema,
    unrealizedPnlUsd: OptionalDecimalSchema,
    feesUsd: v.string(),
    volumeUsd: v.string(),
    products: v.array(ProductProfitAndLossSchema),
    /** Ordered by `symbolId`. */
    markets: v.array(MarketProfitAndLossSchema),
    /** Ordered by `assetId`. */
    holdings: v.array(HoldingProfitAndLossSchema),
    notices: NoticesSchema,
});
export type ProfitAndLoss = v.InferOutput<typeof ProfitAndLossSchema>;

export const DailyProfitAndLossSchema = v.object({
    /** 00:00 UTC of the day. */
    day: TimestampMsSchema,
    pnlUsd: OptionalDecimalSchema,
    realizedPnlUsd: v.string(),
    /** Null for today before it closes. */
    unrealizedPnlAtCloseUsd: OptionalDecimalSchema,
    feesUsd: v.string(),
    volumeUsd: v.string(),
    tradeCount: BigIntStringSchema,
    notices: NoticesSchema,
    /** Equity at the 00:00 UTC that starts the day, reserved funds included. */
    startEquityUsd: OptionalDecimalSchema,
    /** Equity at the 00:00 UTC that ends the day; null for today. */
    endEquityUsd: OptionalDecimalSchema,
    /** Deposits and transfers in minus withdrawals and transfers out. */
    netFlowUsd: OptionalDecimalSchema,
});
export type DailyProfitAndLoss = v.InferOutput<typeof DailyProfitAndLossSchema>;

export const ListDailyProfitAndLossResultSchema = v.object({
    days: v.array(DailyProfitAndLossSchema),
    nextPageToken: v.string(),
    asOf: TimestampMsSchema,
});
/** One page of days, oldest first, days without activity included; empty `nextPageToken` means no more. */
export type ListDailyProfitAndLossResult = v.InferOutput<typeof ListDailyProfitAndLossResultSchema>;

export const TradingStatisticsSchema = v.object({
    windowStart: TimestampMsSchema,
    asOf: TimestampMsSchema,
    tradeCount: BigIntStringSchema,
    volumeUsd: v.string(),
    feesUsd: v.string(),
    realizedPnlUsd: v.string(),
    notices: NoticesSchema,
    /** Time-weighted return in percent over closed days, e.g. `"1.25"` for 1.25%; null for `today`. */
    returnPct: OptionalDecimalSchema,
    /** Largest fall in percent from a previous peak, at day closes. */
    maxDrawdownPct: OptionalDecimalSchema,
    /** Annualized Sharpe ratio; null below 7 daily returns (`sharpe_insufficient_days`). */
    sharpe: OptionalDecimalSchema,
    /** Daily returns the return figures are based on. */
    returnDays: v.number(),
});
export type TradingStatistics = v.InferOutput<typeof TradingStatisticsSchema>;
