import type {
    AssetConfig,
    DepositWithdrawConfig,
    PairStatus,
    SpotConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
} from "../shared/catalog-config.js";
import { RequestError, ValidationError } from "../shared/errors.js";
import type { EnrichedPairConfig, MarketCatalogData } from "./market-data-catalog.js";
import type {
    ZipperCatalogData,
    ZipperContractName,
    ZipperEnrichedAssetChain,
    ZipperEnrichedAssetConfig,
} from "./zipper-catalog.js";

/** Pair lookup key: symbol, symbolId, or an explicit object form. */
export type PairCatalogKey = string | number | { symbol: string } | { symbolId: number };
/** Asset lookup key: symbol, ledger id, or an explicit object form. */
export type AssetCatalogKey = string | number | { symbol: string } | { ledgerId: number };
/** Chain lookup key: chain code, chain id, or an explicit object form. */
export type ChainCatalogKey = string | number | { code: string } | { chainId: number };

/** Raw scaled integer accepted on the SDK side of catalog conversions. */
export type ScaledIntegerLike = bigint | number | string;

export type CatalogLookupDomain = "market" | "ledger" | "orders" | "zipper";
export type CatalogSnapshotSource = "api" | "snapshot";
export type CatalogStateSource = CatalogSnapshotSource | "empty";

/** A catalog lookup key (pair, asset, chain, …) did not match any entry. */
export class CatalogLookupError extends RequestError {
    override readonly code = "CATALOG_LOOKUP_MISS";

    constructor(
        readonly domain: CatalogLookupDomain,
        readonly lookup: string,
        readonly value: string | number,
    ) {
        super(`[catalog] ${domain} ${lookup} not found: ${String(value)}`);
        this.name = "CatalogLookupError";
    }
}

/** The catalog has no snapshot yet — call `catalog.ensureReady()` first. */
export class CatalogNotReadyError extends RequestError {
    override readonly code = "CATALOG_NOT_READY";

    constructor() {
        super("[catalog] no catalog snapshot has been loaded");
        this.name = "CatalogNotReadyError";
    }
}

/** A decimal/scaled conversion failed (bad input or excess precision). */
export class CatalogConversionError extends ValidationError {
    override readonly code = "CATALOG_CONVERSION_INVALID";

    constructor(
        readonly field: string,
        message: string,
    ) {
        super(`[catalog] ${message}`);
        this.name = "CatalogConversionError";
    }
}

/** Order input failed validation against pair constraints. */
export class CatalogValidationFailedError extends ValidationError {
    override readonly code = "CATALOG_VALIDATION_FAILED";

    constructor(readonly errors: readonly CatalogValidationError[]) {
        super(
            `[catalog] order input validation failed: ${errors
                .map((error) => error.message)
                .join("; ")}`,
        );
        this.name = "CatalogValidationFailedError";
    }
}

/**
 * Result of a strict decimal-to-SDK conversion. `scaledValue` is the raw
 * JSON-safe integer string for service calls; `decimal` is the exact decimal
 * string; `display` is the display-normalized decimal string.
 */
export interface ParsedCatalogAmount {
    readonly scaledValue: string;
    readonly decimal: string;
    readonly display: string;
    readonly scale: number;
}

export interface CatalogValidationError {
    readonly field: string;
    readonly rule: string;
    readonly message: string;
    readonly expected?: string;
    readonly actual?: string;
}

export interface CatalogValidationResult {
    readonly valid: boolean;
    readonly errors: readonly CatalogValidationError[];
}

/** Trading constraints for a spot pair, for UI decisions and input validation. */
export interface SpotOrderConstraints {
    readonly symbolId: number;
    readonly symbol: string;
    readonly status: PairStatus;
    readonly tickSize: string;
    readonly stepSize: string;
    readonly minQtyBase: string;
    readonly minNotionalQuote: string;
    readonly priceScale: number;
    readonly quantityScale: number;
    readonly quoteAmountScale: number;
    readonly priceDisplayDecimals: number;
    readonly quantityDisplayDecimals: number;
    readonly quoteAmountDisplayDecimals: number;
}

export interface SpotOrderDecimalInput {
    readonly pair: PairCatalogKey;
    readonly quantity: string;
    readonly price?: string;
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
    /** Passive: resolves the current snapshot or in-flight refresh; never starts one. */
    ready(): Promise<CatalogSnapshot | null>;
    /** Resolves the current snapshot, starting a refresh when the catalog is empty. */
    ensureReady(): Promise<CatalogSnapshot>;
    refresh(): Promise<CatalogSnapshot>;
    setSnapshot(snapshot: CatalogSnapshot): void;
}

export interface CatalogSnapshot {
    readonly source: CatalogSnapshotSource;
    readonly tsMs: number;
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

/**
 * External storage for the catalog's current snapshot. Injecting a cell lets the host
 * own where the snapshot lives (e.g. a reactive signal) while the catalog keeps owning
 * all logic — refresh, dedup, state, readers. Every reader lookup goes through
 * `get()`, so a host whose `get()` reads a reactive source makes every catalog read
 * reactive by construction.
 */
export interface CatalogSnapshotCell {
    get(): CatalogSnapshot | undefined;
    set(snapshot: CatalogSnapshot): void;
}

export interface CreatePolyesterCatalogOptions {
    snapshot?: CatalogSnapshot;
    refresh?: false | CatalogRefreshSource;
    /** When provided, the catalog reads/writes its snapshot through this cell. */
    cell?: CatalogSnapshotCell;
}

export interface MarketCatalogReader {
    listAssets(): readonly AssetConfig[];
    getAsset(asset: AssetCatalogKey): AssetConfig | null;
    requireAsset(asset: AssetCatalogKey): AssetConfig;
    getAssetBySymbol(assetSymbol: string): AssetConfig | null;
    requireAssetBySymbol(assetSymbol: string): AssetConfig;
    getAssetByLedgerId(ledgerAssetId: number): AssetConfig;
    requireAssetByLedgerId(ledgerAssetId: number): AssetConfig;

    listPairs(filter?: {
        listed?: boolean;
        everListed?: boolean;
        atMs?: number;
    }): readonly EnrichedPairConfig[];
    getPair(pair: PairCatalogKey): EnrichedPairConfig | null;
    requirePair(pair: PairCatalogKey): EnrichedPairConfig;
    getPairBySymbol(pairSymbol: string): EnrichedPairConfig | null;
    requirePairBySymbol(pairSymbol: string): EnrichedPairConfig;
    getPairBySymbolId(pairSymbolId: number): EnrichedPairConfig | null;
    requirePairBySymbolId(pairSymbolId: number): EnrichedPairConfig;
    getSymbolIdByPairSymbol(pairSymbol: string): number | null;
    requireSymbolIdByPairSymbol(pairSymbol: string): number;
    getPairSymbolBySymbolId(pairSymbolId: number): string | null;
    requirePairSymbolBySymbolId(pairSymbolId: number): string;

    /** Strictly converts a decimal price into raw price ticks. */
    decimalPriceToTicks(price: string, pair: PairCatalogKey): ParsedCatalogAmount;
    /** Truncates a raw price input to the pair's price precision. */
    normalizePriceInput(price: string, pair: PairCatalogKey): string;
    priceTicksToDecimalString(priceTicks: ScaledIntegerLike, pair: PairCatalogKey): string;
    priceTicksToDisplayString(priceTicks: ScaledIntegerLike, pair: PairCatalogKey): string;
    /** Display-rounds a decimal price string (grouping-free) for UI rendering. */
    formatPrice(price: string, pair: PairCatalogKey): string;

    /** Strictly converts a decimal base quantity into the pair's scaled quantity. */
    decimalQuantityToScaled(quantity: string, pair: PairCatalogKey): ParsedCatalogAmount;
    /** Truncates a raw quantity input to the base asset's quantity scale. */
    normalizeQuantityInput(quantity: string, pair: PairCatalogKey): string;
    quantityScaledToDecimalString(quantityScaled: ScaledIntegerLike, pair: PairCatalogKey): string;
    quantityScaledToDisplayString(quantityScaled: ScaledIntegerLike, pair: PairCatalogKey): string;
    /** Display-rounds a decimal base-quantity string for UI rendering. */
    formatQuantity(quantity: string, pair: PairCatalogKey): string;

    /** Strictly converts a decimal quote amount into the quote asset's scaled amount. */
    decimalQuoteAmountToScaled(amount: string, pair: PairCatalogKey): ParsedCatalogAmount;
    /** Truncates a raw quote amount input to the quote asset's quantity scale. */
    normalizeQuoteAmountInput(amount: string, pair: PairCatalogKey): string;
    quoteAmountScaledToDecimalString(amountScaled: ScaledIntegerLike, pair: PairCatalogKey): string;
    quoteAmountScaledToDisplayString(amountScaled: ScaledIntegerLike, pair: PairCatalogKey): string;
    /** Display-rounds a decimal quote-amount string for UI rendering. */
    formatQuoteAmount(amount: string, pair: PairCatalogKey): string;
}

export interface LedgerCatalogReader {
    getAssetByLedgerId(ledgerAssetId: number): AssetConfig;
    requireAssetByLedgerId(ledgerAssetId: number): AssetConfig;
    getAssetBySymbol(assetSymbol: string): AssetConfig | null;
    requireAssetBySymbol(assetSymbol: string): AssetConfig;
    getLedgerIdBySymbol(assetSymbol: string): number | null;
    requireLedgerIdBySymbol(assetSymbol: string): number;
    requireSymbolByLedgerId(ledgerAssetId: number): string;
    isKnownAssetId(ledgerAssetId: number): boolean;

    /** Strictly converts a decimal amount into the asset's scaled amount. */
    decimalAmountToScaled(amount: string, asset: AssetCatalogKey): ParsedCatalogAmount;
    /** Truncates a raw amount input to the asset's quantity scale. */
    normalizeAmountInput(amount: string, asset: AssetCatalogKey): string;
    amountScaledToDecimalString(amountScaled: ScaledIntegerLike, asset: AssetCatalogKey): string;
    amountScaledToDisplayString(amountScaled: ScaledIntegerLike, asset: AssetCatalogKey): string;
    /** Display-rounds a decimal ledger-amount string for UI rendering. */
    formatAmount(amount: string, asset: AssetCatalogKey): string;
}

export interface OrdersCatalogReader {
    getSpotOrderConstraints(pair: PairCatalogKey): SpotOrderConstraints;
    /**
     * Validates decimal order input against pair constraints: parseability,
     * tick size, step size, min quantity, and min notional when a price is
     * present. Pair status is exposed via constraints, not enforced here.
     */
    validateSpotOrderDecimalInput(input: SpotOrderDecimalInput): CatalogValidationResult;
    /** Like {@link validateSpotOrderDecimalInput} but throws {@link CatalogValidationFailedError}. */
    assertSpotOrderDecimalInput(input: SpotOrderDecimalInput): void;
}

export interface ZipperCatalogReader {
    listChains(): readonly ZipperChainConfig[];
    getChain(chain: ChainCatalogKey): ZipperChainConfig | null;
    requireChain(chain: ChainCatalogKey): ZipperChainConfig;
    getChainByCode(chainCode: string): ZipperChainConfig | null;
    requireChainByCode(chainCode: string): ZipperChainConfig;
    getChainById(chainId: number): ZipperChainConfig | null;
    requireChainById(chainId: number): ZipperChainConfig;
    getChainIdByCode(chainCode: string): number | null;
    requireChainIdByCode(chainCode: string): number;

    listAssets(): readonly ZipperEnrichedAssetConfig[];
    getAsset(asset: AssetCatalogKey): ZipperEnrichedAssetConfig | null;
    requireAsset(asset: AssetCatalogKey): ZipperEnrichedAssetConfig;
    getAssetBySymbol(assetSymbol: string): ZipperEnrichedAssetConfig | null;
    requireAssetBySymbol(assetSymbol: string): ZipperEnrichedAssetConfig;
    getAssetByLedgerId(ledgerAssetId: number): ZipperEnrichedAssetConfig;
    requireAssetByLedgerId(ledgerAssetId: number): ZipperEnrichedAssetConfig;
    getAssetByUAssetId(uAssetId: string): ZipperEnrichedAssetConfig | null;
    requireAssetByUAssetId(uAssetId: string): ZipperEnrichedAssetConfig;

    getAssetChain(asset: AssetCatalogKey, chain: ChainCatalogKey): ZipperAssetChainRoute | null;
    requireAssetChain(asset: AssetCatalogKey, chain: ChainCatalogKey): ZipperAssetChainRoute;
    getAssetChainByZippedAssetId(zippedAssetId: number): ZipperAssetChainRoute | null;
    requireAssetChainByZippedAssetId(zippedAssetId: number): ZipperAssetChainRoute;
    getZippedAssetId(asset: AssetCatalogKey, chain: ChainCatalogKey): number | null;
    requireZippedAssetId(asset: AssetCatalogKey, chain: ChainCatalogKey): number;

    listContracts(): readonly ZipperChainContractConfig[];
    getContract(contractName: ZipperContractName): ZipperChainContractConfig | null;
    requireContract(contractName: ZipperContractName): ZipperChainContractConfig;
    getContractByName(contractName: ZipperContractName): ZipperChainContractConfig | null;
    requireContractByName(contractName: ZipperContractName): ZipperChainContractConfig;
}
