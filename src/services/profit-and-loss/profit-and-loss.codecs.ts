import * as Proto from "../../gen/pnl/v1/pnl_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const PROFIT_AND_LOSS_WINDOW_VALUES = ["today", "days_7", "days_30", "lifetime"] as const;
/**
 * Period a read covers. Every window ends now and starts at 00:00 UTC: `today`, `days_7` (today
 * and the 6 days before), `days_30` (today and the 29 days before), or `lifetime` (from the day
 * of the account's first trade or transfer).
 */
export type ProfitAndLossWindow = (typeof PROFIT_AND_LOSS_WINDOW_VALUES)[number];

export const PROFIT_AND_LOSS_PRODUCT_VALUES = ["spot"] as const;
export type ProfitAndLossProduct = (typeof PROFIT_AND_LOSS_PRODUCT_VALUES)[number];

export const PROFIT_AND_LOSS_NOTICE_VALUES = [
    "price_unavailable",
    "mark_unavailable",
    "unclassified_transfer",
    "quantity_shortfall",
    "equity_unavailable",
    "flow_unvalued",
    "sharpe_insufficient_days",
] as const;
/** What a reply's figures leave out. A figure that needs a missing price is null, never `"0"`. */
export type ProfitAndLossNotice = (typeof PROFIT_AND_LOSS_NOTICE_VALUES)[number];

export const ProfitAndLossWindowCodec = {
    inputToProto: {
        today: Proto.ProfitAndLossWindow.TODAY,
        days_7: Proto.ProfitAndLossWindow.DAYS_7,
        days_30: Proto.ProfitAndLossWindow.DAYS_30,
        lifetime: Proto.ProfitAndLossWindow.LIFETIME,
    } satisfies InputToProto<ProfitAndLossWindow, Proto.ProfitAndLossWindow>,
} as const;

export const ProfitAndLossProductCodec = {
    inputToProto: {
        spot: Proto.ProfitAndLossProduct.SPOT,
    } satisfies InputToProto<ProfitAndLossProduct, Proto.ProfitAndLossProduct>,
    protoToOutput: {
        [Proto.ProfitAndLossProduct.UNSPECIFIED]: "unspecified",
        [Proto.ProfitAndLossProduct.SPOT]: "spot",
    } satisfies ProtoToOutput<Proto.ProfitAndLossProduct, ProfitAndLossProduct>,
} as const;

export const ProfitAndLossNoticeCodec = {
    protoToOutput: {
        [Proto.ProfitAndLossNotice.UNSPECIFIED]: "unspecified",
        [Proto.ProfitAndLossNotice.PRICE_UNAVAILABLE]: "price_unavailable",
        [Proto.ProfitAndLossNotice.MARK_UNAVAILABLE]: "mark_unavailable",
        [Proto.ProfitAndLossNotice.UNCLASSIFIED_TRANSFER]: "unclassified_transfer",
        [Proto.ProfitAndLossNotice.QUANTITY_SHORTFALL]: "quantity_shortfall",
        [Proto.ProfitAndLossNotice.EQUITY_UNAVAILABLE]: "equity_unavailable",
        [Proto.ProfitAndLossNotice.FLOW_UNVALUED]: "flow_unvalued",
        [Proto.ProfitAndLossNotice.SHARPE_INSUFFICIENT_DAYS]: "sharpe_insufficient_days",
    } satisfies ProtoToOutput<Proto.ProfitAndLossNotice, ProfitAndLossNotice>,
} as const;
