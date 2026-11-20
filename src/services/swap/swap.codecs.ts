import * as Proto from "../../gen/swap/v1/swap_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const SWAP_STATUS_VALUES = [
    "executing",
    "completed",
    "partially_completed",
    "failed",
    "reconciling",
] as const;
/**
 * `executing` places, fills and settles orders; `reconciling` is establishing an order's outcome
 * (balances already show settled fills). `completed`, `partially_completed` and `failed` are
 * terminal: anything not traded stays on the account.
 */
export type SwapStatus = (typeof SWAP_STATUS_VALUES)[number];

export const SWAP_REASON_VALUES = [
    "insufficient_balance",
    "price_protection",
    "market_unavailable",
    "order_size_out_of_range",
    "rate_limited",
    "order_rejected",
    "expired",
    "minimum_not_met",
    "max_order_quantity",
] as const;
/** Why a `partially_completed` or `failed` swap did not trade its whole amount. */
export type SwapReason = (typeof SWAP_REASON_VALUES)[number];

export const SWAP_ORDER_STATUS_VALUES = [
    "placing",
    "placed",
    "refused",
    "not_placed",
    "unconfirmed",
] as const;
export type SwapOrderStatus = (typeof SWAP_ORDER_STATUS_VALUES)[number];

/** Swap API error code on a rejected call's `detail` (service `swap`), e.g. `QUOTE_EXPIRED`. */
export type SwapErrorCode = keyof typeof Proto.ErrorCode;

export const SwapStatusCodec = {
    protoToOutput: {
        [Proto.SwapStatus.STATUS_UNSPECIFIED]: "unspecified",
        [Proto.SwapStatus.EXECUTING]: "executing",
        [Proto.SwapStatus.COMPLETED]: "completed",
        [Proto.SwapStatus.PARTIALLY_COMPLETED]: "partially_completed",
        [Proto.SwapStatus.FAILED]: "failed",
        [Proto.SwapStatus.RECONCILING]: "reconciling",
    } satisfies ProtoToOutput<Proto.SwapStatus, SwapStatus>,
} as const;

export const SwapReasonCodec = {
    protoToOutput: {
        [Proto.SwapReason.REASON_UNSPECIFIED]: "unspecified",
        [Proto.SwapReason.INSUFFICIENT_BALANCE]: "insufficient_balance",
        [Proto.SwapReason.PRICE_PROTECTION]: "price_protection",
        [Proto.SwapReason.MARKET_UNAVAILABLE]: "market_unavailable",
        [Proto.SwapReason.ORDER_SIZE_OUT_OF_RANGE]: "order_size_out_of_range",
        [Proto.SwapReason.RATE_LIMITED]: "rate_limited",
        [Proto.SwapReason.ORDER_REJECTED]: "order_rejected",
        [Proto.SwapReason.EXPIRED]: "expired",
        [Proto.SwapReason.MINIMUM_NOT_MET]: "minimum_not_met",
        [Proto.SwapReason.MAX_ORDER_QUANTITY]: "max_order_quantity",
    } satisfies ProtoToOutput<Proto.SwapReason, SwapReason>,
} as const;

export const SwapOrderStatusCodec = {
    protoToOutput: {
        [Proto.SwapOrderStatus.ORDER_STATUS_UNSPECIFIED]: "unspecified",
        [Proto.SwapOrderStatus.PLACING]: "placing",
        [Proto.SwapOrderStatus.PLACED]: "placed",
        [Proto.SwapOrderStatus.REFUSED]: "refused",
        [Proto.SwapOrderStatus.NOT_PLACED]: "not_placed",
        [Proto.SwapOrderStatus.UNCONFIRMED]: "unconfirmed",
    } satisfies ProtoToOutput<Proto.SwapOrderStatus, SwapOrderStatus>,
} as const;

export const SwapSideCodec = {
    protoToOutput: {
        [Proto.Side.SIDE_UNSPECIFIED]: "unspecified",
        [Proto.Side.BUY]: "buy",
        [Proto.Side.SELL]: "sell",
    } satisfies ProtoToOutput<Proto.Side, "buy" | "sell">,
} as const;
