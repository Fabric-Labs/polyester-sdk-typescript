import type {
    AssetConfig,
    DepositWithdrawConfig,
    SpotConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
} from "../shared/catalog-config.js";
import type { EnrichedPairConfig, MarketCatalogData } from "./market-data-catalog.js";
import type {
    ZipperCatalogData,
    ZipperContractName,
    ZipperEnrichedAssetChain,
    ZipperEnrichedAssetConfig,
} from "./zipper-catalog.js";

export type PairCatalogKey = string | number;
export type AssetCatalogKey = string | number;
export type ChainCatalogKey = string | number;

export type CatalogLookupDomain = "market" | "ledger" | "orders" | "zipper";
export type CatalogSnapshotSource = "api" | "snapshot";
export type CatalogStateSource = CatalogSnapshotSource | "empty";

export class CatalogLookupError extends Error {
    readonly code = "CATALOG_LOOKUP_MISS";

    constructor(
        readonly domain: CatalogLookupDomain,
        readonly lookup: string,
        readonly value: string | number,
    ) {
        super(`[catalog] ${domain} ${lookup} not found: ${String(value)}`);
        this.name = "CatalogLookupError";
    }
}

export class CatalogNotReadyError extends Error {
    readonly code = "CATALOG_NOT_READY";

    constructor() {
        super("[catalog] no catalog snapshot has been loaded");
        this.name = "CatalogNotReadyError";
    }
}

export interface ParsedCatalogAmount {
    readonly value: string;
    readonly scale: number;
    readonly formatted: string;
}

export interface ZipperAssetChainRoute {
    readonly asset: ZipperEnrichedAssetConfig;
    readonly chain: ZipperEnrichedAssetChain;
}

export interface CatalogReader {
    readonly market: MarketCatalogReader;
    readonly ledger: LedgerCatalogReader;
    readonly orders: OrdersCatalogReader;
    readonly zipper: ZipperCatalogReader;
    snapshot(): CatalogSnapshot;
}

export interface ClientCatalog extends CatalogReader {
    state(): CatalogState;
    ready(): Promise<CatalogSnapshot | null>;
    refresh(): Promise<CatalogSnapshot>;
}

export interface CatalogSnapshot {
    readonly source: CatalogSnapshotSource;
    readonly loadedAtMs: number;
    readonly version: number;
    readonly market: MarketCatalogData;
    readonly zipper: ZipperCatalogData;
}

export type CatalogState =
    | { status: "empty" }
    | { status: "refreshing"; previousSource: CatalogStateSource }
    | { status: "fresh"; source: CatalogSnapshotSource }
    | { status: "stale"; source: CatalogStateSource; error: unknown };

export interface CatalogRefreshSource {
    market(): Promise<SpotConfig>;
    zipper(): Promise<DepositWithdrawConfig>;
}

export interface CreatePolyesterCatalogOptions {
    snapshot?: CatalogSnapshot;
    refresh?: false | CatalogRefreshSource;
}

export interface MarketCatalogReader {
    listAssets(): readonly AssetConfig[];
    getAssetBySymbol(assetSymbol: string): AssetConfig | null;
    requireAssetBySymbol(assetSymbol: string): AssetConfig;
    getAssetByLedgerId(ledgerAssetId: number): AssetConfig | null;
    listPairs(filter?: {
        listed?: boolean;
        everListed?: boolean;
        atMs?: number;
    }): readonly EnrichedPairConfig[];
    getPairBySymbol(pairSymbol: string): EnrichedPairConfig | null;
    requirePairBySymbol(pairSymbol: string): EnrichedPairConfig;
    getSymbolIdByPairSymbol(pairSymbol: string): number | null;
    requireSymbolIdByPairSymbol(pairSymbol: string): number;
    getPairBySymbolId(pairSymbolId: number): EnrichedPairConfig | null;
    requirePairBySymbolId(pairSymbolId: number): EnrichedPairConfig;
    getPairSymbolBySymbolId(pairSymbolId: number): string | null;
    requirePairSymbolBySymbolId(pairSymbolId: number): string;
}

export interface LedgerCatalogReader {
    getAssetByLedgerId(ledgerAssetId: number): AssetConfig | null;
    requireAssetByLedgerId(ledgerAssetId: number): AssetConfig;
    getAssetBySymbol(assetSymbol: string): AssetConfig | null;
    requireAssetBySymbol(assetSymbol: string): AssetConfig;
    getLedgerIdBySymbol(assetSymbol: string): number | null;
    requireLedgerIdBySymbol(assetSymbol: string): number;
    requireSymbolByLedgerId(ledgerAssetId: number): string;
    parseAmount(amount: string, asset: AssetCatalogKey): ParsedCatalogAmount;
    formatAmount(amount: string, asset: AssetCatalogKey): string;
    isKnownAssetId(ledgerAssetId: number): boolean;
}

export interface OrdersCatalogReader {
    parseQuantity(quantity: string, pair: PairCatalogKey): ParsedCatalogAmount;
    parsePrice(price: string, pair: PairCatalogKey): ParsedCatalogAmount;
    formatQuantity(quantity: bigint | number | string, pairSymbolId: number): string;
    formatPrice(priceTicks: bigint | number | string, pairSymbolId: number): string;
    validateOrderInput(input: { pair: PairCatalogKey; quantity: string; price?: string }): void;
    formatFee(feeScaled: bigint | number | string, pairSymbolId: number, feeSource: number): string;
}

export interface ZipperCatalogReader {
    listChains(): readonly ZipperChainConfig[];
    getChainByCode(chainCode: string): ZipperChainConfig | null;
    requireChainByCode(chainCode: string): ZipperChainConfig;
    getChainIdByCode(chainCode: string): number | null;
    requireChainIdByCode(chainCode: string): number;
    getChainById(chainId: number): ZipperChainConfig | null;
    requireChainById(chainId: number): ZipperChainConfig;
    listAssets(): readonly ZipperEnrichedAssetConfig[];
    getAssetBySymbol(assetSymbol: string): ZipperEnrichedAssetConfig | null;
    requireAssetBySymbol(assetSymbol: string): ZipperEnrichedAssetConfig;
    getAssetByLedgerId(ledgerAssetId: number): ZipperEnrichedAssetConfig | null;
    requireAssetByLedgerId(ledgerAssetId: number): ZipperEnrichedAssetConfig;
    getAssetChain(asset: AssetCatalogKey, chain: ChainCatalogKey): ZipperAssetChainRoute | null;
    requireAssetChain(asset: AssetCatalogKey, chain: ChainCatalogKey): ZipperAssetChainRoute;
    listContracts(): readonly ZipperChainContractConfig[];
    getContractByName(contractName: ZipperContractName | string): ZipperChainContractConfig | null;
    requireContractByName(contractName: ZipperContractName | string): ZipperChainContractConfig;
}
