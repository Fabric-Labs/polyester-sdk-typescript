import { AssetDataSource } from "../../gen/marketdata/v1/asset_info_pb.js";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const SIDE_FILTER_VALUES = ["buy", "sell"] as const;
export type SideFilterValue = (typeof SIDE_FILTER_VALUES)[number];

export const SideFilterCodec = {
    inputToProto: {
        buy: Proto.SideFilter.BUY,
        sell: Proto.SideFilter.SELL,
    } satisfies Record<SideFilterValue, Proto.SideFilter>,
} as const;

export const ASSET_DATA_SOURCE_VALUES = ["coinmarketcap", "polyester"] as const;
/** Who supplied a market value; show "Source: CoinMarketCap" with a `coinmarketcap` one. */
export type AssetDataSourceValue = (typeof ASSET_DATA_SOURCE_VALUES)[number];

export const AssetDataSourceCodec = {
    protoToOutput: {
        [AssetDataSource.SOURCE_UNSPECIFIED]: "unspecified",
        [AssetDataSource.COINMARKETCAP]: "coinmarketcap",
        [AssetDataSource.POLYESTER]: "polyester",
    } satisfies ProtoToOutput<AssetDataSource, AssetDataSourceValue>,
} as const;

export const PairStatusCodec = {
    protoToOutput: {
        [Proto.PairStatus.UNSPECIFIED]: "unknown",
        [Proto.PairStatus.ENABLED]: "enabled",
        [Proto.PairStatus.DISABLED]: "disabled",
        [Proto.PairStatus.CANCEL_ONLY]: "cancel_only",
        [Proto.PairStatus.POST_ONLY]: "post_only",
        [Proto.PairStatus.REDUCE_ONLY]: "reduce_only",
        [Proto.PairStatus.HALTED]: "halted",
    },
} as const;
