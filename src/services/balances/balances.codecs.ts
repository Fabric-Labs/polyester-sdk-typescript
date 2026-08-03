import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const BALANCE_RANGE_VALUES = ["1d", "7d", "30d", "90d", "180d", "365d"] as const;
export type BalanceRangeMapKey = (typeof BALANCE_RANGE_VALUES)[number];

export const EQUITY_GROUP_BY_VALUES = ["account", "asset"] as const;
export type EquityGroupByMapKey = (typeof EQUITY_GROUP_BY_VALUES)[number];

export const BalanceRangeCodec = {
    inputToProto: {
        "1d": Proto.BalanceRange.DAY_1,
        "7d": Proto.BalanceRange.DAY_7,
        "30d": Proto.BalanceRange.DAY_30,
        "90d": Proto.BalanceRange.DAY_90,
        "180d": Proto.BalanceRange.DAY_180,
        "365d": Proto.BalanceRange.DAY_365,
    } satisfies InputToProto<BalanceRangeMapKey, Proto.BalanceRange>,
    protoToOutput: {
        [Proto.BalanceRange.RANGE_UNSPECIFIED]: "unspecified",
        [Proto.BalanceRange.DAY_1]: "1d",
        [Proto.BalanceRange.DAY_7]: "7d",
        [Proto.BalanceRange.DAY_30]: "30d",
        [Proto.BalanceRange.DAY_90]: "90d",
        [Proto.BalanceRange.DAY_180]: "180d",
        [Proto.BalanceRange.DAY_365]: "365d",
    } satisfies ProtoToOutput<Proto.BalanceRange, BalanceRangeMapKey>,
} as const;

export const EquityGroupByCodec = {
    inputToProto: {
        account: Proto.EquityGroupBy.GROUP_BY_ACCOUNT,
        asset: Proto.EquityGroupBy.GROUP_BY_ASSET,
    } satisfies InputToProto<EquityGroupByMapKey, Proto.EquityGroupBy>,
} as const;
