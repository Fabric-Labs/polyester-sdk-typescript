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

export const PRICE_BAND_STATE_VALUES = ["active", "off", "empty", "unknown"] as const;
/**
 * `active`: limits apply. `off`: the pair has no band. `empty`: no price lies inside the band, so
 * every order that adds exposure is rejected until it moves. `unknown`: no current band.
 */
export type PriceBandStateValue = (typeof PRICE_BAND_STATE_VALUES)[number];

export const PriceBandStateCodec = {
    protoToOutput: {
        [Proto.PriceBandState.BAND_STATE_UNSPECIFIED]: "unspecified",
        [Proto.PriceBandState.ACTIVE]: "active",
        [Proto.PriceBandState.OFF]: "off",
        [Proto.PriceBandState.EMPTY]: "empty",
        [Proto.PriceBandState.UNKNOWN]: "unknown",
    } satisfies ProtoToOutput<Proto.PriceBandState, PriceBandStateValue>,
} as const;

export const PRICE_BAND_REFERENCE_SOURCE_VALUES = [
    "last_trade",
    "listing_reference",
    "index_price",
] as const;
export type PriceBandReferenceSourceValue = (typeof PRICE_BAND_REFERENCE_SOURCE_VALUES)[number];

export const PriceBandReferenceSourceCodec = {
    protoToOutput: {
        [Proto.PriceBandReferenceSource.REFERENCE_SOURCE_UNSPECIFIED]: "unspecified",
        [Proto.PriceBandReferenceSource.LAST_TRADE]: "last_trade",
        [Proto.PriceBandReferenceSource.LISTING_REFERENCE]: "listing_reference",
        [Proto.PriceBandReferenceSource.INDEX_PRICE]: "index_price",
    } satisfies ProtoToOutput<Proto.PriceBandReferenceSource, PriceBandReferenceSourceValue>,
} as const;
