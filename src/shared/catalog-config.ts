export type PairMarketDataConfig = {
    orderbookPriceBuckets: number[];
};

export type PairStatus =
    | "enabled"
    | "disabled"
    | "cancel_only"
    | "post_only"
    | "reduce_only"
    | "unknown";

export const PAIR_STATUSES = [
    "enabled",
    "disabled",
    "cancel_only",
    "post_only",
    "reduce_only",
] as const satisfies readonly PairStatus[];

export interface AssetConfig {
    symbol: string;
    ledgerId: number;
    name: string;
    quantityDisplayDecimals: number;
    quantityScale: number;
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
    allowBuyFeeFromBase: boolean;
    defaultMarketSlippagePctBuy: number;
    defaultMarketSlippagePctSell: number;
    maxClientRefDriftPct: number;
    marketdata?: PairMarketDataConfig;
    baseQuantityScale: number;
    quoteQuantityScale: number;
    listingAt?: number | null;
    delistingAt?: number | null;
    status: PairStatus;
}

export interface SpotConfig {
    assets: AssetConfig[];
    pairs: PairConfig[];
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
    polyesterChainId: number;
    contracts: ZipperChainContractConfig[];
    tsMs: number;
}
