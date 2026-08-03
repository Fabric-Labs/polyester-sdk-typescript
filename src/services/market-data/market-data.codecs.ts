import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";

export const SIDE_FILTER_VALUES = ["buy", "sell"] as const;
export type SideFilterValue = (typeof SIDE_FILTER_VALUES)[number];

export const SideFilterCodec = {
    inputToProto: {
        buy: Proto.SideFilter.BUY,
        sell: Proto.SideFilter.SELL,
    } satisfies Record<SideFilterValue, Proto.SideFilter>,
} as const;

export const PairStatusCodec = {
    protoToOutput: {
        [Proto.PairStatus.UNSPECIFIED]: "unknown",
        [Proto.PairStatus.ENABLED]: "enabled",
        [Proto.PairStatus.DISABLED]: "disabled",
        [Proto.PairStatus.CANCEL_ONLY]: "cancel_only",
        [Proto.PairStatus.POST_ONLY]: "post_only",
        [Proto.PairStatus.REDUCE_ONLY]: "reduce_only",
    },
} as const;
