import * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";

export const TRADING_WITHDRAW_ACTION_VALUES = ["to_funding"] as const;
export type TradingWithdrawActionValue = (typeof TRADING_WITHDRAW_ACTION_VALUES)[number];

export const TradingWithdrawActionCodec = {
	inputToProto: {
		to_funding: Proto.TradingWithdrawAction.TO_FUNDING,
	} satisfies Record<TradingWithdrawActionValue, Proto.TradingWithdrawAction>,
} as const;
