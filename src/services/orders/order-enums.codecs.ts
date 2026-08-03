import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const ORDER_SIDE_VALUES = ["buy", "sell"] as const;
export type OrderSideValue = (typeof ORDER_SIDE_VALUES)[number];

export const ORDER_TYPE_VALUES = ["limit", "market"] as const;
export type OrderTypeValue = (typeof ORDER_TYPE_VALUES)[number];

export const TIME_IN_FORCE_VALUES = ["gtc", "ioc", "fok"] as const;
export type TimeInForceValue = (typeof TIME_IN_FORCE_VALUES)[number];
export const TIME_IN_FORCE_OUTPUT_VALUES = ["GTC", "IOC", "FOK"] as const;
export type TimeInForceOutputValue = (typeof TIME_IN_FORCE_OUTPUT_VALUES)[number];

export const FEE_ASSET_VALUES = ["quote", "base"] as const;
export type FeeAssetValue = (typeof FEE_ASSET_VALUES)[number];

export const SELF_TRADE_PREVENTION_MODE_VALUES = [
    "expire_taker",
    "expire_maker",
    "expire_both",
] as const;
export type SelfTradePreventionModeValue = (typeof SELF_TRADE_PREVENTION_MODE_VALUES)[number];

export const TRIGGER_PRICE_SOURCE_VALUES = ["last", "index", "mark"] as const;
export type TriggerPriceSourceValue = (typeof TRIGGER_PRICE_SOURCE_VALUES)[number];

export const OrderSideCodec = {
    inputToProto: {
        buy: ProtoWrite.Side.BUY,
        sell: ProtoWrite.Side.SELL,
    } satisfies InputToProto<OrderSideValue, ProtoWrite.Side>,
    protoToOutput: {
        [ProtoWrite.Side.SIDE_UNSPECIFIED]: "unspecified",
        [ProtoWrite.Side.BUY]: "buy",
        [ProtoWrite.Side.SELL]: "sell",
    } satisfies ProtoToOutput<ProtoWrite.Side, OrderSideValue>,
} as const;

export const OrderTypeCodec = {
    inputToProto: {
        limit: ProtoWrite.OrderType.LIMIT,
        market: ProtoWrite.OrderType.MARKET,
    } satisfies InputToProto<OrderTypeValue, ProtoWrite.OrderType>,
    protoToOutput: {
        [ProtoWrite.OrderType.ORDER_TYPE_UNSPECIFIED]: "unspecified",
        [ProtoWrite.OrderType.LIMIT]: "limit",
        [ProtoWrite.OrderType.MARKET]: "market",
    } satisfies ProtoToOutput<ProtoWrite.OrderType, OrderTypeValue>,
} as const;

export const TimeInForceCodec = {
    inputToProto: {
        gtc: ProtoWrite.TimeInForce.GTC,
        ioc: ProtoWrite.TimeInForce.IOC,
        fok: ProtoWrite.TimeInForce.FOK,
    } satisfies InputToProto<TimeInForceValue, ProtoWrite.TimeInForce>,
    protoToOutput: {
        [ProtoWrite.TimeInForce.TIME_IN_FORCE_UNSPECIFIED]: "unspecified",
        [ProtoWrite.TimeInForce.GTC]: "GTC",
        [ProtoWrite.TimeInForce.IOC]: "IOC",
        [ProtoWrite.TimeInForce.FOK]: "FOK",
    } satisfies ProtoToOutput<ProtoWrite.TimeInForce, TimeInForceOutputValue>,
} as const;

export const FeeAssetCodec = {
    inputToProto: {
        quote: ProtoWrite.FeeAsset.QUOTE,
        base: ProtoWrite.FeeAsset.BASE,
    } satisfies InputToProto<FeeAssetValue, ProtoWrite.FeeAsset>,
    protoToOutput: {
        [ProtoWrite.FeeAsset.FEE_ASSET_UNSPECIFIED]: "unspecified",
        [ProtoWrite.FeeAsset.QUOTE]: "quote",
        [ProtoWrite.FeeAsset.BASE]: "base",
    } satisfies ProtoToOutput<ProtoWrite.FeeAsset, FeeAssetValue>,
} as const;

export const SelfTradePreventionModeCodec = {
    inputToProto: {
        expire_taker: ProtoWrite.SelfTradePreventionMode.EXPIRE_TAKER,
        expire_maker: ProtoWrite.SelfTradePreventionMode.EXPIRE_MAKER,
        expire_both: ProtoWrite.SelfTradePreventionMode.EXPIRE_BOTH,
    } satisfies InputToProto<SelfTradePreventionModeValue, ProtoWrite.SelfTradePreventionMode>,
    protoToOutput: {
        [ProtoWrite.SelfTradePreventionMode.SELF_TRADE_PREVENTION_MODE_UNSPECIFIED]: "unspecified",
        [ProtoWrite.SelfTradePreventionMode.EXPIRE_TAKER]: "expire_taker",
        [ProtoWrite.SelfTradePreventionMode.EXPIRE_MAKER]: "expire_maker",
        [ProtoWrite.SelfTradePreventionMode.EXPIRE_BOTH]: "expire_both",
    } satisfies ProtoToOutput<ProtoWrite.SelfTradePreventionMode, SelfTradePreventionModeValue>,
} as const;

export const TriggerPriceSourceCodec = {
    inputToProto: {
        last: ProtoWrite.TriggerPriceSource.LAST_PRICE,
        index: ProtoWrite.TriggerPriceSource.INDEX_PRICE,
        mark: ProtoWrite.TriggerPriceSource.MARK_PRICE,
    } satisfies InputToProto<TriggerPriceSourceValue, ProtoWrite.TriggerPriceSource>,
    protoToOutput: {
        [ProtoWrite.TriggerPriceSource.TRIGGER_PRICE_SOURCE_UNSPECIFIED]: "unspecified",
        [ProtoWrite.TriggerPriceSource.LAST_PRICE]: "last",
        [ProtoWrite.TriggerPriceSource.INDEX_PRICE]: "index",
        [ProtoWrite.TriggerPriceSource.MARK_PRICE]: "mark",
    } satisfies ProtoToOutput<ProtoWrite.TriggerPriceSource, TriggerPriceSourceValue>,
} as const;
