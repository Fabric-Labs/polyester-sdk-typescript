import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";

export const ORDER_STATUS_FILTER_VALUES = ["FILLED", "CANCELED", "REJECTED"] as const;
export type OrderStatusFilterValue = (typeof ORDER_STATUS_FILTER_VALUES)[number];

export const ORDER_SIDE_VALUES = ["buy", "sell"] as const;
export type OrderSideValue = (typeof ORDER_SIDE_VALUES)[number];

export const ORDER_TYPE_VALUES = ["limit", "market"] as const;
export type OrderTypeValue = (typeof ORDER_TYPE_VALUES)[number];

export const TIF_VALUES = ["gtc", "ioc", "fok"] as const;
export type TifValue = (typeof TIF_VALUES)[number];

export const FEE_SOURCE_VALUES = ["quote", "received"] as const;
export type FeeSourceValue = (typeof FEE_SOURCE_VALUES)[number];

export const STP_MODE_VALUES = ["expire_taker", "expire_maker", "expire_both"] as const;
export type StpModeValue = (typeof STP_MODE_VALUES)[number];

export const ORDER_ORIGIN_SCOPE_VALUES = [
    "unknown",
    "direct",
    "attached_risk",
    "standalone_trigger",
    "system",
] as const;
export type OrderOriginScope = (typeof ORDER_ORIGIN_SCOPE_VALUES)[number];

export const ORDER_TRIGGER_TYPE_VALUES = [
    "unknown",
    "stop_loss",
    "take_profit",
    "trailing_stop",
    "twap",
    "ladder",
] as const;
export type OrderTriggerType = (typeof ORDER_TRIGGER_TYPE_VALUES)[number];

export const TRIGGER_PRICE_SOURCE_VALUES = ["last", "index", "mark"] as const;
export type TriggerPriceSourceValue = (typeof TRIGGER_PRICE_SOURCE_VALUES)[number];

export const MODIFY_BEHAVIOR_VALUES = ["AMEND_OR_REPLACE", "AMEND_ONLY", "REPLACE_ONLY"] as const;
export type ModifyBehaviorValue = (typeof MODIFY_BEHAVIOR_VALUES)[number];

export const MODIFY_ACTION_VALUES = ["UNSPECIFIED", "AMENDED", "REPLACED"] as const;
export type ModifyActionValue = (typeof MODIFY_ACTION_VALUES)[number];

export const OrderStatusFilterCodec = {
    inputToProto: {
        FILLED: ProtoRead.OrderStatus.FILLED,
        CANCELED: ProtoRead.OrderStatus.CANCELED,
        REJECTED: ProtoRead.OrderStatus.REJECTED,
    } satisfies Record<OrderStatusFilterValue, ProtoRead.OrderStatus>,
} as const;

export const OrderSideCodec = {
    inputToProto: {
        buy: ProtoWrite.Side.BUY,
        sell: ProtoWrite.Side.SELL,
    } satisfies Record<OrderSideValue, ProtoWrite.Side>,
} as const;

export const OrderTypeCodec = {
    inputToProto: {
        limit: ProtoWrite.OrderType.LIMIT,
        market: ProtoWrite.OrderType.MARKET,
    } satisfies Record<OrderTypeValue, ProtoWrite.OrderType>,
} as const;

export const TifCodec = {
    inputToProto: {
        gtc: ProtoWrite.TIF.GTC,
        ioc: ProtoWrite.TIF.IOC,
        fok: ProtoWrite.TIF.FOK,
    } satisfies Record<TifValue, ProtoWrite.TIF>,
} as const;

export const FeeSourceCodec = {
    inputToProto: {
        quote: ProtoWrite.FeeSource.QUOTE,
        received: ProtoWrite.FeeSource.RECEIVED,
    } satisfies Record<FeeSourceValue, ProtoWrite.FeeSource>,
} as const;

export const StpModeCodec = {
    inputToProto: {
        expire_taker: ProtoWrite.STPMode.EXPIRE_TAKER,
        expire_maker: ProtoWrite.STPMode.EXPIRE_MAKER,
        expire_both: ProtoWrite.STPMode.EXPIRE_BOTH,
    } satisfies Record<StpModeValue, ProtoWrite.STPMode>,
} as const;

export const OrderOriginScopeCodec = {
    protoToLabel: {
        [ProtoRead.OrderOriginScope.ORDER_ORIGIN_SCOPE_UNSPECIFIED]: "unknown",
        [ProtoRead.OrderOriginScope.DIRECT]: "direct",
        [ProtoRead.OrderOriginScope.ATTACHED_RISK]: "attached_risk",
        [ProtoRead.OrderOriginScope.STANDALONE_TRIGGER]: "standalone_trigger",
        [ProtoRead.OrderOriginScope.SYSTEM]: "system",
    } satisfies Record<ProtoRead.OrderOriginScope, OrderOriginScope>,
} as const;

export const OrderTriggerTypeCodec = {
    protoToLabel: {
        [ProtoRead.OrderTriggerType.ORDER_TRIGGER_TYPE_UNSPECIFIED]: "unknown",
        [ProtoRead.OrderTriggerType.STOP_LOSS]: "stop_loss",
        [ProtoRead.OrderTriggerType.TAKE_PROFIT]: "take_profit",
        [ProtoRead.OrderTriggerType.TRAILING_STOP]: "trailing_stop",
        [ProtoRead.OrderTriggerType.TWAP]: "twap",
        [ProtoRead.OrderTriggerType.LADDER]: "ladder",
    } satisfies Record<ProtoRead.OrderTriggerType, OrderTriggerType>,
} as const;

export const TriggerPriceSourceCodec = {
    inputToProto: {
        last: ProtoWrite.TriggerPriceSource.LAST_PRICE,
        index: ProtoWrite.TriggerPriceSource.INDEX_PRICE,
        mark: ProtoWrite.TriggerPriceSource.MARK_PRICE,
    } satisfies Record<TriggerPriceSourceValue, ProtoWrite.TriggerPriceSource>,
} as const;

export const ModifyBehaviorCodec = {
    inputToProto: {
        AMEND_OR_REPLACE: ProtoWrite.ModifyBehavior.AMEND_OR_REPLACE,
        AMEND_ONLY: ProtoWrite.ModifyBehavior.AMEND_ONLY,
        REPLACE_ONLY: ProtoWrite.ModifyBehavior.REPLACE_ONLY,
    } satisfies Record<ModifyBehaviorValue, ProtoWrite.ModifyBehavior>,
} as const;

export const ModifyActionCodec = {
    protoToLabel: {
        [ProtoWrite.ModifyActionTaken.MODIFY_ACTION_UNSPECIFIED]: "UNSPECIFIED",
        [ProtoWrite.ModifyActionTaken.AMENDED]: "AMENDED",
        [ProtoWrite.ModifyActionTaken.REPLACED]: "REPLACED",
    } satisfies Record<ProtoWrite.ModifyActionTaken, ModifyActionValue>,
} as const;
