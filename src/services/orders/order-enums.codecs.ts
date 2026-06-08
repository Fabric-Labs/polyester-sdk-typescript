import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const ORDER_SIDE_VALUES = ["buy", "sell"] as const;
export type OrderSideValue = (typeof ORDER_SIDE_VALUES)[number];

export const ORDER_TYPE_VALUES = ["limit", "market"] as const;
export type OrderTypeValue = (typeof ORDER_TYPE_VALUES)[number];

export const TIF_VALUES = ["gtc", "ioc", "fok"] as const;
export type TifValue = (typeof TIF_VALUES)[number];
export const TIF_OUTPUT_VALUES = ["GTC", "IOC", "FOK"] as const;
export type TifOutputValue = (typeof TIF_OUTPUT_VALUES)[number];

export const FEE_SOURCE_VALUES = ["quote", "received"] as const;
export type FeeSourceValue = (typeof FEE_SOURCE_VALUES)[number];

export const STP_MODE_VALUES = ["expire_taker", "expire_maker", "expire_both"] as const;
export type StpModeValue = (typeof STP_MODE_VALUES)[number];

export const TRIGGER_PRICE_SOURCE_VALUES = ["last", "index", "mark"] as const;
export type TriggerPriceSourceValue = (typeof TRIGGER_PRICE_SOURCE_VALUES)[number];

export const OrderSideCodec = {
    inputToProto: {
        buy: ProtoWrite.Side.BUY,
        sell: ProtoWrite.Side.SELL,
    } satisfies InputToProto<OrderSideValue, ProtoWrite.Side>,
    protoToOutput: {
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
        [ProtoWrite.OrderType.LIMIT]: "limit",
        [ProtoWrite.OrderType.MARKET]: "market",
    } satisfies ProtoToOutput<ProtoWrite.OrderType, OrderTypeValue>,
} as const;

export const TifCodec = {
    inputToProto: {
        gtc: ProtoWrite.TIF.GTC,
        ioc: ProtoWrite.TIF.IOC,
        fok: ProtoWrite.TIF.FOK,
    } satisfies InputToProto<TifValue, ProtoWrite.TIF>,
    protoToOutput: {
        [ProtoWrite.TIF.GTC]: "GTC",
        [ProtoWrite.TIF.IOC]: "IOC",
        [ProtoWrite.TIF.FOK]: "FOK",
    } satisfies ProtoToOutput<ProtoWrite.TIF, TifOutputValue>,
} as const;

export const FeeSourceCodec = {
    inputToProto: {
        quote: ProtoWrite.FeeSource.QUOTE,
        received: ProtoWrite.FeeSource.RECEIVED,
    } satisfies InputToProto<FeeSourceValue, ProtoWrite.FeeSource>,
    protoToOutput: {
        [ProtoWrite.FeeSource.QUOTE]: "quote",
        [ProtoWrite.FeeSource.RECEIVED]: "received",
    } satisfies ProtoToOutput<ProtoWrite.FeeSource, FeeSourceValue>,
} as const;

export const StpModeCodec = {
    inputToProto: {
        expire_taker: ProtoWrite.STPMode.EXPIRE_TAKER,
        expire_maker: ProtoWrite.STPMode.EXPIRE_MAKER,
        expire_both: ProtoWrite.STPMode.EXPIRE_BOTH,
    } satisfies InputToProto<StpModeValue, ProtoWrite.STPMode>,
    protoToOutput: {
        [ProtoWrite.STPMode.EXPIRE_TAKER]: "expire_taker",
        [ProtoWrite.STPMode.EXPIRE_MAKER]: "expire_maker",
        [ProtoWrite.STPMode.EXPIRE_BOTH]: "expire_both",
    } satisfies ProtoToOutput<ProtoWrite.STPMode, StpModeValue>,
} as const;

export const TriggerPriceSourceCodec = {
    inputToProto: {
        last: ProtoWrite.TriggerPriceSource.LAST_PRICE,
        index: ProtoWrite.TriggerPriceSource.INDEX_PRICE,
        mark: ProtoWrite.TriggerPriceSource.MARK_PRICE,
    } satisfies InputToProto<TriggerPriceSourceValue, ProtoWrite.TriggerPriceSource>,
    protoToOutput: {
        [ProtoWrite.TriggerPriceSource.LAST_PRICE]: "last",
        [ProtoWrite.TriggerPriceSource.INDEX_PRICE]: "index",
        [ProtoWrite.TriggerPriceSource.MARK_PRICE]: "mark",
    } satisfies ProtoToOutput<ProtoWrite.TriggerPriceSource, TriggerPriceSourceValue>,
} as const;
