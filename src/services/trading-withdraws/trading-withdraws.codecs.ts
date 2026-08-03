import * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";

export const TRADING_WITHDRAW_ACTION_VALUES = ["to_funding", "to_external_chain"] as const;
export type TradingWithdrawActionValue = (typeof TRADING_WITHDRAW_ACTION_VALUES)[number];

export const TradingWithdrawActionCodec = {
    inputToProto: {
        to_funding: Proto.TradingWithdrawAction.TO_FUNDING,
        to_external_chain: Proto.TradingWithdrawAction.TO_EXTERNAL_CHAIN,
    } satisfies Record<TradingWithdrawActionValue, Proto.TradingWithdrawAction>,
} as const;
