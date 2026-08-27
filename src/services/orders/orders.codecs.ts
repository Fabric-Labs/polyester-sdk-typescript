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

export const ORDER_STATUS_FILTER_VALUES = ["FILLED", "CANCELED", "REJECTED"] as const;
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

export const MODIFY_BEHAVIOR_VALUES = ["AMEND_OR_REPLACE", "AMEND_ONLY", "REPLACE_ONLY"] as const;
export type ModifyBehaviorValue = (typeof MODIFY_BEHAVIOR_VALUES)[number];

export const MODIFY_ACTION_VALUES = ["AMENDED", "REPLACED"] as const;
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

export const OrderStatusFilterCodec = {
    inputToProto: {
        FILLED: ProtoRead.OrderStatus.FILLED,
        CANCELED: ProtoRead.OrderStatus.CANCELED,
        REJECTED: ProtoRead.OrderStatus.REJECTED,
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
        AMEND_OR_REPLACE: ProtoWrite.ModifyBehavior.AMEND_OR_REPLACE,
        AMEND_ONLY: ProtoWrite.ModifyBehavior.AMEND_ONLY,
        REPLACE_ONLY: ProtoWrite.ModifyBehavior.REPLACE_ONLY,
    } satisfies InputToProto<ModifyBehaviorValue, ProtoWrite.ModifyBehavior>,
} as const;

export const ModifyActionCodec = {
    protoToOutput: {
        [ProtoWrite.ModifyActionTaken.MODIFY_ACTION_UNSPECIFIED]: "unspecified",
        [ProtoWrite.ModifyActionTaken.AMENDED]: "AMENDED",
        [ProtoWrite.ModifyActionTaken.REPLACED]: "REPLACED",
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
