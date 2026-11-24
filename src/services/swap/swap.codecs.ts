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
    "intermediate_below_minimum",
] as const;
/**
 * Why a `partially_completed` or `failed` swap did not trade its whole amount.
 * `intermediate_below_minimum`: on a two-leg route, intermediate asset below the second market's
 * minimum order stays on the account (`intermediateRemainder`).
 */
export type SwapReason = (typeof SWAP_REASON_VALUES)[number];

export const SWAP_ORDER_STATUS_VALUES = [
    "placing",
    "placed",
    "refused",
    "not_placed",
    "unconfirmed",
] as const;
export type SwapOrderStatus = (typeof SWAP_ORDER_STATUS_VALUES)[number];

export const SWAP_SLICE_STATE_VALUES = [
    "planned",
    "executing",
    "traded",
    "partly_traded",
    "skipped",
    "failed",
] as const;
/**
 * `planned` and `executing` are pending; `traded` traded in full, `partly_traded` left an order
 * partly unfilled or intermediate unconverted, `skipped` and `failed` traded no input.
 */
export type SwapSliceState = (typeof SWAP_SLICE_STATE_VALUES)[number];

export const SWAP_SLICE_REASON_VALUES = [
    "slot_missed",
    "deadline_reached",
    "market_closed",
    "below_minimum",
    "above_maximum",
    "protection_not_met",
    "refused",
    "insufficient_liquidity",
    "execution_ended",
] as const;
/** Why a final TWAP slice did not trade in full, or why its intermediate asset was carried. */
export type SwapSliceReason = (typeof SWAP_SLICE_REASON_VALUES)[number];

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
        [Proto.SwapReason.INTERMEDIATE_BELOW_MINIMUM]: "intermediate_below_minimum",
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

export const SwapSliceStateCodec = {
    protoToOutput: {
        [Proto.SwapSlice_State.STATE_UNSPECIFIED]: "unspecified",
        [Proto.SwapSlice_State.PLANNED]: "planned",
        [Proto.SwapSlice_State.EXECUTING]: "executing",
        [Proto.SwapSlice_State.TRADED]: "traded",
        [Proto.SwapSlice_State.PARTLY_TRADED]: "partly_traded",
        [Proto.SwapSlice_State.SKIPPED]: "skipped",
        [Proto.SwapSlice_State.FAILED]: "failed",
    } satisfies ProtoToOutput<Proto.SwapSlice_State, SwapSliceState>,
} as const;

export const SwapSliceReasonCodec = {
    protoToOutput: {
        [Proto.SwapSlice_Reason.SLICE_REASON_UNSPECIFIED]: "unspecified",
        [Proto.SwapSlice_Reason.SLOT_MISSED]: "slot_missed",
        [Proto.SwapSlice_Reason.DEADLINE_REACHED]: "deadline_reached",
        [Proto.SwapSlice_Reason.MARKET_CLOSED]: "market_closed",
        [Proto.SwapSlice_Reason.BELOW_MINIMUM]: "below_minimum",
        [Proto.SwapSlice_Reason.ABOVE_MAXIMUM]: "above_maximum",
        [Proto.SwapSlice_Reason.PROTECTION_NOT_MET]: "protection_not_met",
        [Proto.SwapSlice_Reason.REFUSED]: "refused",
        [Proto.SwapSlice_Reason.INSUFFICIENT_LIQUIDITY]: "insufficient_liquidity",
        [Proto.SwapSlice_Reason.EXECUTION_ENDED]: "execution_ended",
    } satisfies ProtoToOutput<Proto.SwapSlice_Reason, SwapSliceReason>,
} as const;

export const SwapSideCodec = {
    protoToOutput: {
        [Proto.Side.SIDE_UNSPECIFIED]: "unspecified",
        [Proto.Side.BUY]: "buy",
        [Proto.Side.SELL]: "sell",
    } satisfies ProtoToOutput<Proto.Side, "buy" | "sell">,
} as const;
