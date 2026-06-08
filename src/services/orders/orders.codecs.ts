import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";
export {
    FEE_SOURCE_VALUES,
    FeeSourceCodec,
    type FeeSourceValue,
    ORDER_SIDE_VALUES,
    ORDER_TYPE_VALUES,
    OrderSideCodec,
    type OrderSideValue,
    OrderTypeCodec,
    type OrderTypeValue,
    STP_MODE_VALUES,
    StpModeCodec,
    type StpModeValue,
    TIF_OUTPUT_VALUES,
    TIF_VALUES,
    TifCodec,
    type TifOutputValue,
    type TifValue,
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
    "stop_loss",
    "take_profit",
    "trailing_stop",
    "twap",
    "ladder",
] as const;
export type OrderTriggerType = (typeof ORDER_TRIGGER_TYPE_VALUES)[number];

export const MODIFY_BEHAVIOR_VALUES = ["AMEND_OR_REPLACE", "AMEND_ONLY", "REPLACE_ONLY"] as const;
export type ModifyBehaviorValue = (typeof MODIFY_BEHAVIOR_VALUES)[number];

export const MODIFY_ACTION_VALUES = ["AMENDED", "REPLACED"] as const;
export type ModifyActionValue = (typeof MODIFY_ACTION_VALUES)[number];

export const OrderStatusFilterCodec = {
    inputToProto: {
        FILLED: ProtoRead.OrderStatus.FILLED,
        CANCELED: ProtoRead.OrderStatus.CANCELED,
        REJECTED: ProtoRead.OrderStatus.REJECTED,
    } satisfies InputToProto<OrderStatusFilterValue, ProtoRead.OrderStatus>,
} as const;

export const OrderStatusCodec = {
    protoToOutput: {
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
        [ProtoRead.OrderOriginScope.DIRECT]: "direct",
        [ProtoRead.OrderOriginScope.ATTACHED_RISK]: "attached_risk",
        [ProtoRead.OrderOriginScope.STANDALONE_TRIGGER]: "standalone_trigger",
        [ProtoRead.OrderOriginScope.SYSTEM]: "system",
    } satisfies ProtoToOutput<ProtoRead.OrderOriginScope, OrderOriginScope>,
} as const;

export const OrderTriggerTypeCodec = {
    protoToOutput: {
        [ProtoRead.OrderTriggerType.STOP_LOSS]: "stop_loss",
        [ProtoRead.OrderTriggerType.TAKE_PROFIT]: "take_profit",
        [ProtoRead.OrderTriggerType.TRAILING_STOP]: "trailing_stop",
        [ProtoRead.OrderTriggerType.TWAP]: "twap",
        [ProtoRead.OrderTriggerType.LADDER]: "ladder",
    } satisfies ProtoToOutput<ProtoRead.OrderTriggerType, OrderTriggerType>,
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
        [ProtoWrite.ModifyActionTaken.AMENDED]: "AMENDED",
        [ProtoWrite.ModifyActionTaken.REPLACED]: "REPLACED",
    } satisfies ProtoToOutput<ProtoWrite.ModifyActionTaken, ModifyActionValue>,
} as const;
