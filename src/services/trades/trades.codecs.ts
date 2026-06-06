import * as Proto from "../../gen/orders/v1/orders_pb.js";

export const TRADE_SIDE_VALUES = ["buy", "sell"] as const;
export type TradeSideValue = (typeof TRADE_SIDE_VALUES)[number];

export const TradeSideCodec = {
	inputToProto: {
		buy: Proto.Side.BUY,
		sell: Proto.Side.SELL,
	} satisfies Record<TradeSideValue, Proto.Side>,
} as const;
