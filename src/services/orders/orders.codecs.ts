import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";
export {
    FEE_ASSET_VALUES,
    FeeAssetCodec,
    type FeeAssetValue,
    ORDER_SIDE_VALUES,
    ORDER_TYPE_VALUES,
    OrderSideCodec,
    type OrderSideValue,
    OrderTypeCodec,
    type OrderTypeValue,
    SELF_TRADE_PREVENTION_MODE_VALUES,
    SelfTradePreventionModeCodec,
    type SelfTradePreventionModeValue,
    TIME_IN_FORCE_OUTPUT_VALUES,
    TIME_IN_FORCE_VALUES,
    TimeInForceCodec,
    type TimeInForceOutputValue,
    type TimeInForceValue,
    TRIGGER_PRICE_SOURCE_VALUES,
    TriggerPriceSourceCodec,
    type TriggerPriceSourceValue,
} from "./order-enums.codecs.js";

export const ORDER_STATUS_FILTER_VALUES = ["filled", "canceled", "rejected"] as const;
export type OrderStatusFilterValue = (typeof ORDER_STATUS_FILTER_VALUES)[number];

export const ORDER_STATUS_VALUES = [
    "pending",
    "pending_cancel",
    "working",
    "filled",
    "canceled",
    "rejected",
] as const;
export type OrderStatusValue = (typeof ORDER_STATUS_VALUES)[number];

export const ORDER_ORIGIN_SCOPE_VALUES = [
    "direct",
    "attached_risk",
    "standalone_trigger",
    "system",
] as const;
export type OrderOriginScope = (typeof ORDER_ORIGIN_SCOPE_VALUES)[number];

export const ORDER_CANCEL_REASON_VALUES = [
    "user_request",
    "ioc_remainder",
    "market_remainder",
    "stp_expire_maker",
    "stp_expire_taker",
    "stp_expire_both",
    "replaced",
    "gtd_expired",
    "qty_at_or_below_filled",
    "pair_drain",
    "attached_risk_refused",
    "cancel_all_after",
    "account_repair",
    "twap_rollover",
    "strategy_cancel",
    "market_halted",
    "attached_exit_fired",
    "system",
] as const;
export type OrderCancelReasonValue = (typeof ORDER_CANCEL_REASON_VALUES)[number];

export const OrderCancelReasonCodec = {
    protoToOutput: {
        [ProtoRead.CancelReason.UNSPECIFIED]: "unspecified",
        [ProtoRead.CancelReason.USER_REQUEST]: "user_request",
        [ProtoRead.CancelReason.IOC_REMAINDER]: "ioc_remainder",
        [ProtoRead.CancelReason.MARKET_REMAINDER]: "market_remainder",
        [ProtoRead.CancelReason.STP_EXPIRE_MAKER]: "stp_expire_maker",
        [ProtoRead.CancelReason.STP_EXPIRE_TAKER]: "stp_expire_taker",
        [ProtoRead.CancelReason.STP_EXPIRE_BOTH]: "stp_expire_both",
        [ProtoRead.CancelReason.REPLACED]: "replaced",
        [ProtoRead.CancelReason.GTD_EXPIRED]: "gtd_expired",
        [ProtoRead.CancelReason.QTY_AT_OR_BELOW_FILLED]: "qty_at_or_below_filled",
        [ProtoRead.CancelReason.PAIR_DRAIN]: "pair_drain",
        [ProtoRead.CancelReason.ATTACHED_RISK_REFUSED]: "attached_risk_refused",
        [ProtoRead.CancelReason.CANCEL_ALL_AFTER]: "cancel_all_after",
        [ProtoRead.CancelReason.ACCOUNT_REPAIR]: "account_repair",
        [ProtoRead.CancelReason.TWAP_ROLLOVER]: "twap_rollover",
        [ProtoRead.CancelReason.STRATEGY_CANCEL]: "strategy_cancel",
        [ProtoRead.CancelReason.MARKET_HALTED]: "market_halted",
        [ProtoRead.CancelReason.ATTACHED_EXIT_FIRED]: "attached_exit_fired",
        [ProtoRead.CancelReason.SYSTEM]: "system",
    } satisfies ProtoToOutput<ProtoRead.CancelReason, OrderCancelReasonValue>,
} as const;

export const ORDER_TRIGGER_TYPE_VALUES = [
    "unspecified",
    "stop_loss",
    "take_profit",
    "trailing_stop",
    "twap",
    "ladder",
] as const;
export type OrderTriggerType = (typeof ORDER_TRIGGER_TYPE_VALUES)[number];

export const ATTACHED_RISK_LEG_STATUS_VALUES = [
    "not_configured",
    "created",
    "armed",
    "running",
    "completed",
    "canceled",
    "failed",
    "paused",
] as const;
export type AttachedRiskLegStatusValue = (typeof ATTACHED_RISK_LEG_STATUS_VALUES)[number];

export const MODIFY_BEHAVIOR_VALUES = ["amend_or_replace", "amend_only", "replace_only"] as const;
export type ModifyBehaviorValue = (typeof MODIFY_BEHAVIOR_VALUES)[number];

export const MODIFY_ACTION_VALUES = ["amended", "replaced"] as const;
export type ModifyActionValue = (typeof MODIFY_ACTION_VALUES)[number];

export const BATCH_REPLACE_ADMISSION_STATUS_VALUES = [
    "admitted",
    "partially_admitted",
    "rejected",
] as const;
export type BatchReplaceAdmissionStatusValue =
    (typeof BATCH_REPLACE_ADMISSION_STATUS_VALUES)[number];

export const BATCH_REPLACE_ITEM_ADMISSION_STATUS_VALUES = ["admitted", "rejected"] as const;
export type BatchReplaceItemAdmissionStatusValue =
    (typeof BATCH_REPLACE_ITEM_ADMISSION_STATUS_VALUES)[number];

export const BATCH_REPLACE_PHASE_VALUES = ["admitted", "working", "rejected", "terminal"] as const;
export type BatchReplacePhaseValue = (typeof BATCH_REPLACE_PHASE_VALUES)[number];

export const CancelOrderStatusCodec = {
    protoToOutput: {
        [ProtoWrite.CancelOrderResponse_Status.STATUS_UNSPECIFIED]: "unspecified",
        [ProtoWrite.CancelOrderResponse_Status.ACCEPTED]: "accepted",
    } satisfies ProtoToOutput<ProtoWrite.CancelOrderResponse_Status, "accepted">,
} as const;

export const CancelAllOrdersStatusCodec = {
    protoToOutput: {
        [ProtoWrite.CancelAllOrdersResponse_Status.STATUS_UNSPECIFIED]: "unspecified",
        [ProtoWrite.CancelAllOrdersResponse_Status.SUBMITTED]: "submitted",
        [ProtoWrite.CancelAllOrdersResponse_Status.DRY_RUN]: "dry_run",
    } satisfies ProtoToOutput<ProtoWrite.CancelAllOrdersResponse_Status, "submitted" | "dry_run">,
} as const;

export const CancelAllListingStatusCodec = {
    protoToOutput: {
        [ProtoWrite.CancelAllOrdersResponse_ListingStatus.LISTING_UNSPECIFIED]: "unspecified",
        [ProtoWrite.CancelAllOrdersResponse_ListingStatus.INCLUDED]: "included",
        [ProtoWrite.CancelAllOrdersResponse_ListingStatus.NOT_RETAINED_READ_OPEN_ORDERS]:
            "not_retained_read_open_orders",
    } satisfies ProtoToOutput<
        ProtoWrite.CancelAllOrdersResponse_ListingStatus,
        "included" | "not_retained_read_open_orders"
    >,
} as const;

export const CancelAllAfterStatusCodec = {
    protoToOutput: {
        [ProtoWrite.CancelAllAfterResponse_Status.STATUS_UNSPECIFIED]: "unspecified",
        [ProtoWrite.CancelAllAfterResponse_Status.ARMED]: "armed",
        [ProtoWrite.CancelAllAfterResponse_Status.DISABLED]: "disabled",
    } satisfies ProtoToOutput<ProtoWrite.CancelAllAfterResponse_Status, "armed" | "disabled">,
} as const;

export const BatchCancelOrderStatusCodec = {
    protoToOutput: {
        [ProtoWrite.BatchCancelResultItem_Status.STATUS_UNSPECIFIED]: "unspecified",
        [ProtoWrite.BatchCancelResultItem_Status.ACCEPTED]: "accepted",
        [ProtoWrite.BatchCancelResultItem_Status.REJECTED]: "rejected",
    } satisfies ProtoToOutput<ProtoWrite.BatchCancelResultItem_Status, "accepted" | "rejected">,
} as const;

export const OrderStatusFilterCodec = {
    inputToProto: {
        filled: ProtoRead.OrderStatus.FILLED,
        canceled: ProtoRead.OrderStatus.CANCELED,
        rejected: ProtoRead.OrderStatus.REJECTED,
    } satisfies InputToProto<OrderStatusFilterValue, ProtoRead.OrderStatus>,
} as const;

export const OrderStatusCodec = {
    protoToOutput: {
        [ProtoRead.OrderStatus.ORDER_STATUS_UNSPECIFIED]: "unspecified",
        [ProtoRead.OrderStatus.PENDING]: "pending",
        [ProtoRead.OrderStatus.PENDING_CANCEL]: "pending_cancel",
        [ProtoRead.OrderStatus.WORKING]: "working",
        [ProtoRead.OrderStatus.FILLED]: "filled",
        [ProtoRead.OrderStatus.CANCELED]: "canceled",
        [ProtoRead.OrderStatus.REJECTED]: "rejected",
    } satisfies ProtoToOutput<ProtoRead.OrderStatus, OrderStatusValue>,
} as const;

export const OrderOriginScopeCodec = {
    protoToOutput: {
        [ProtoRead.OrderOriginScope.ORDER_ORIGIN_SCOPE_UNSPECIFIED]: "unspecified",
        [ProtoRead.OrderOriginScope.DIRECT]: "direct",
        [ProtoRead.OrderOriginScope.ATTACHED_RISK]: "attached_risk",
        [ProtoRead.OrderOriginScope.STANDALONE_TRIGGER]: "standalone_trigger",
        [ProtoRead.OrderOriginScope.SYSTEM]: "system",
    } satisfies ProtoToOutput<ProtoRead.OrderOriginScope, OrderOriginScope>,
} as const;

export const OrderTriggerTypeCodec = {
    protoToOutput: {
        [ProtoRead.OrderTriggerType.ORDER_TRIGGER_TYPE_UNSPECIFIED]: "unspecified",
        [ProtoRead.OrderTriggerType.STOP_LOSS]: "stop_loss",
        [ProtoRead.OrderTriggerType.TAKE_PROFIT]: "take_profit",
        [ProtoRead.OrderTriggerType.TRAILING_STOP]: "trailing_stop",
        [ProtoRead.OrderTriggerType.TWAP]: "twap",
        [ProtoRead.OrderTriggerType.LADDER]: "ladder",
    } satisfies Record<ProtoRead.OrderTriggerType, OrderTriggerType>,
} as const;

export const AttachedRiskLegStatusCodec = {
    protoToOutput: {
        [ProtoRead.AttachedRiskLegState_Status.STATUS_UNSPECIFIED]: "unspecified",
        [ProtoRead.AttachedRiskLegState_Status.NOT_CONFIGURED]: "not_configured",
        [ProtoRead.AttachedRiskLegState_Status.CREATED]: "created",
        [ProtoRead.AttachedRiskLegState_Status.ARMED]: "armed",
        [ProtoRead.AttachedRiskLegState_Status.RUNNING]: "running",
        [ProtoRead.AttachedRiskLegState_Status.COMPLETED]: "completed",
        [ProtoRead.AttachedRiskLegState_Status.CANCELED]: "canceled",
        [ProtoRead.AttachedRiskLegState_Status.FAILED]: "failed",
        [ProtoRead.AttachedRiskLegState_Status.PAUSED]: "paused",
    } satisfies ProtoToOutput<ProtoRead.AttachedRiskLegState_Status, AttachedRiskLegStatusValue>,
} as const;

export const ModifyBehaviorCodec = {
    inputToProto: {
        amend_or_replace: ProtoWrite.ModifyBehavior.AMEND_OR_REPLACE,
        amend_only: ProtoWrite.ModifyBehavior.AMEND_ONLY,
        replace_only: ProtoWrite.ModifyBehavior.REPLACE_ONLY,
    } satisfies InputToProto<ModifyBehaviorValue, ProtoWrite.ModifyBehavior>,
} as const;

export const ModifyActionCodec = {
    protoToOutput: {
        [ProtoWrite.ModifyActionTaken.MODIFY_ACTION_UNSPECIFIED]: "unspecified",
        [ProtoWrite.ModifyActionTaken.AMENDED]: "amended",
        [ProtoWrite.ModifyActionTaken.REPLACED]: "replaced",
    } satisfies ProtoToOutput<ProtoWrite.ModifyActionTaken, ModifyActionValue>,
} as const;

export const BatchReplaceAdmissionStatusCodec = {
    protoToOutput: {
        [ProtoWrite.BatchReplaceAdmissionStatus.UNSPECIFIED]: "unspecified",
        [ProtoWrite.BatchReplaceAdmissionStatus.ADMITTED]: "admitted",
        [ProtoWrite.BatchReplaceAdmissionStatus.PARTIALLY_ADMITTED]: "partially_admitted",
        [ProtoWrite.BatchReplaceAdmissionStatus.REJECTED]: "rejected",
    } satisfies ProtoToOutput<
        ProtoWrite.BatchReplaceAdmissionStatus,
        BatchReplaceAdmissionStatusValue
    >,
} as const;

export const BatchReplaceItemAdmissionStatusCodec = {
    protoToOutput: {
        [ProtoWrite.BatchReplaceItemAdmissionStatus.UNSPECIFIED]: "unspecified",
        [ProtoWrite.BatchReplaceItemAdmissionStatus.ADMITTED]: "admitted",
        [ProtoWrite.BatchReplaceItemAdmissionStatus.REJECTED]: "rejected",
    } satisfies ProtoToOutput<
        ProtoWrite.BatchReplaceItemAdmissionStatus,
        BatchReplaceItemAdmissionStatusValue
    >,
} as const;

export const BatchReplacePhaseCodec = {
    protoToOutput: {
        [ProtoRead.BatchReplacePhase.UNSPECIFIED]: "unspecified",
        [ProtoRead.BatchReplacePhase.ADMITTED]: "admitted",
        [ProtoRead.BatchReplacePhase.WORKING]: "working",
        [ProtoRead.BatchReplacePhase.REJECTED]: "rejected",
        [ProtoRead.BatchReplacePhase.TERMINAL]: "terminal",
    } satisfies ProtoToOutput<ProtoRead.BatchReplacePhase, BatchReplacePhaseValue>,
} as const;
