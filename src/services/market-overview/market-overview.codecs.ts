import * as Proto from "../../gen/marketoverview/v1/marketoverview_pb.js";

export const SPARKLINE_INTERVAL_VALUES = ["1h", "24h", "1w", "1m"] as const;
export type SparklineIntervalValue = (typeof SPARKLINE_INTERVAL_VALUES)[number];

export const MARKET_OVERVIEW_ORDER_BY_VALUES = [
    "change_24h_bp",
    "volume_24h_quote",
    "last_price",
    "date_added",
] as const;
export type MarketOverviewOrderByValue = (typeof MARKET_OVERVIEW_ORDER_BY_VALUES)[number];

export const MARKET_OVERVIEW_SORT_VALUES = ["asc", "desc"] as const;
export type MarketOverviewSortValue = (typeof MARKET_OVERVIEW_SORT_VALUES)[number];

export const SparklineIntervalCodec = {
    inputToProto: {
        "1h": Proto.SparklineInterval.SPARKLINE_1H,
        "24h": Proto.SparklineInterval.SPARKLINE_24H,
        "1w": Proto.SparklineInterval.SPARKLINE_1W,
        "1m": Proto.SparklineInterval.SPARKLINE_1M,
    } satisfies Record<SparklineIntervalValue, Proto.SparklineInterval>,
    protoToOutput: {
        [Proto.SparklineInterval.SPARKLINE_INTERVAL_UNSPECIFIED]: undefined,
        [Proto.SparklineInterval.SPARKLINE_1H]: "1h",
        [Proto.SparklineInterval.SPARKLINE_24H]: "24h",
        [Proto.SparklineInterval.SPARKLINE_1W]: "1w",
        [Proto.SparklineInterval.SPARKLINE_1M]: "1m",
    } satisfies Record<Proto.SparklineInterval, SparklineIntervalValue | undefined>,
} as const;

export const MarketOverviewOrderByCodec = {
    inputToProto: {
        change_24h_bp: Proto.MarketOrderBy.ORDER_BY_CHANGE_24H_BP,
        volume_24h_quote: Proto.MarketOrderBy.ORDER_BY_VOLUME_24H_QUOTE,
        last_price: Proto.MarketOrderBy.ORDER_BY_LAST_PRICE,
        date_added: Proto.MarketOrderBy.ORDER_BY_DATE_ADDED,
    } satisfies Record<MarketOverviewOrderByValue, Proto.MarketOrderBy>,
} as const;

export const MarketOverviewSortCodec = {
    inputToProto: {
        asc: Proto.SortDirection.SORT_ASC,
        desc: Proto.SortDirection.SORT_DESC,
    } satisfies Record<MarketOverviewSortValue, Proto.SortDirection>,
} as const;
