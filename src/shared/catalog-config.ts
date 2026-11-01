export type PairMarketDataConfig = {
    orderbookPriceBuckets: number[];
};

export type PairStatus =
    | "enabled"
    | "disabled"
    | "cancel_only"
    | "post_only"
    | "reduce_only"
    | "halted"
    | "unknown";

export const PAIR_STATUSES = [
    "enabled",
    "disabled",
    "cancel_only",
    "post_only",
    "reduce_only",
    "halted",
] as const satisfies readonly PairStatus[];

export interface AssetConfig {
    symbol: string;
    ledgerId: number;
    name: string;
    quantityDisplayDecimals: number;
    quantityScale: number;
    /** Scale for public candle and market-overview base volume. Absent on older snapshots. */
    marketDataVolumeScale?: number;
}

export interface PairConfig {
    symbolId: number;
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    tickSize: string;
    stepSize: string;
    minNotionalQuote: string;
    minQtyBase: string;
    /** Largest limit order quantity in base units; absent when the pair has no maximum. */
    maxLimitQtyBase?: string;
    /** Largest market order quantity in base units; absent when the pair has no maximum. */
    maxMarketQtyBase?: string;
    /** Largest order notional in quote units; absent when the pair has no maximum. */
    maxOrderNotionalQuote?: string;
    /** Largest market order notional in quote units; absent when the pair has no maximum. */
    maxMarketNotionalQuote?: string;
    /** Default resting-order limit for a typical account on this pair. Absent on older snapshots. */
    maxOpenOrdersPerPair?: number;
    allowBuyFeeFromBase: boolean;
    defaultMarketSlippagePctBuy: number;
    defaultMarketSlippagePctSell: number;
    maxClientRefDriftPct: number;
    marketdata?: PairMarketDataConfig;
    baseQuantityScale: number;
    quoteQuantityScale: number;
    /** Scale for composite reference candle prices. Absent on older snapshots. */
    referencePriceScale?: number;
    listingAt?: number | null;
    delistingAt?: number | null;
    status: PairStatus;
}

export interface SpotConfig {
    assets: AssetConfig[];
    pairs: PairConfig[];
    /** Default resting-order limit for a typical account across all pairs. Absent on older snapshots. */
    maxOpenOrdersTotal?: number;
    tsSec: number;
}

export interface ZipperChainConfig {
    chainId: number;
    code: string;
    name: string;
    nativeChainId: string;
    nativeCurrencySymbol: string;
    explorerUrl: string;
    icon: string;
    requiredConfirmations: number;
    confirmationTimeSeconds: number;
    isCaseSensitive: boolean;
    minAddressLength: number;
    maxAddressLength: number;
}

export interface ZipperTokenConfig {
    address: string;
    decimals: number;
}

export interface ZipperAssetChainVariant {
    zippedAssetId: number;
    chainId: number;
    isNativeAsset: boolean;
    networkFee: string;
    networkFeeTsSec: number;
    depositMinAmount: string;
    withdrawMinAmount: string;
    supply: string;
    sourceToken: ZipperTokenConfig;
    zToken: ZipperTokenConfig;
}

export interface ZipperAssetConfig {
    asset: string;
    ledgerId: number;
    name: string;
    icon: string;
    quantityScale: number;
    quantityDisplayDecimals: number;
    variants: ZipperAssetChainVariant[];
    uAssetId: string;
}

export interface ZipperChainContractConfig {
    name: string;
    address: string;
    type: string;
    description: string;
    version: number;
}

export interface DepositWithdrawConfig {
    chains: ZipperChainConfig[];
    assets: ZipperAssetConfig[];
    contracts: ZipperChainContractConfig[];
    tsMs: number;
}
