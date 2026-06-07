import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import type { ExcludeUnspecified } from "../../utils/types.js";

export const BALANCE_RANGE_VALUES = ["1d", "7d", "30d", "90d", "180d", "365d"] as const;
export type BalanceRangeMapKey = (typeof BALANCE_RANGE_VALUES)[number];

export const EQUITY_GROUP_BY_VALUES = ["account", "asset"] as const;
export type EquityGroupByMapKey = (typeof EQUITY_GROUP_BY_VALUES)[number];

type ProtoBalanceRange = ExcludeUnspecified<Proto.BalanceRange>;
type ProtoEquityGroupBy = ExcludeUnspecified<Proto.EquityGroupBy>;

export const BalanceRangeCodec = {
	inputToProto: {
		"1d": Proto.BalanceRange.DAY_1,
		"7d": Proto.BalanceRange.DAY_7,
		"30d": Proto.BalanceRange.DAY_30,
		"90d": Proto.BalanceRange.DAY_90,
		"180d": Proto.BalanceRange.DAY_180,
		"365d": Proto.BalanceRange.DAY_365,
	} satisfies Record<BalanceRangeMapKey, ProtoBalanceRange>,
	protoToOutput: {
		[Proto.BalanceRange.DAY_1]: "1d",
		[Proto.BalanceRange.DAY_7]: "7d",
		[Proto.BalanceRange.DAY_30]: "30d",
		[Proto.BalanceRange.DAY_90]: "90d",
		[Proto.BalanceRange.DAY_180]: "180d",
		[Proto.BalanceRange.DAY_365]: "365d",
	} satisfies Record<ProtoBalanceRange, BalanceRangeMapKey>,
	protoToOutputWithDefault: {
		[Proto.BalanceRange.BALANCE_RANGE_UNSPECIFIED]: "1d",
		[Proto.BalanceRange.DAY_1]: "1d",
		[Proto.BalanceRange.DAY_7]: "7d",
		[Proto.BalanceRange.DAY_30]: "30d",
		[Proto.BalanceRange.DAY_90]: "90d",
		[Proto.BalanceRange.DAY_180]: "180d",
		[Proto.BalanceRange.DAY_365]: "365d",
	} satisfies Record<Proto.BalanceRange, BalanceRangeMapKey>,
} as const;

export const EquityGroupByCodec = {
	inputToProto: {
		account: Proto.EquityGroupBy.GROUP_BY_ACCOUNT,
		asset: Proto.EquityGroupBy.GROUP_BY_ASSET,
	} satisfies Record<EquityGroupByMapKey, ProtoEquityGroupBy>,
} as const;
