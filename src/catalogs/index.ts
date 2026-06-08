import type { AssetConfig, SpotConfig } from "../services/market-data/market-data.schemas.js";
import type {
    DepositWithdrawConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
} from "../services/zipper/zipper.schemas.js";
import { decimalToScaledInt } from "../utils/numbers.js";
import { ASSET_CATALOG, PAIR_CATALOG } from "./market-data-catalog.generated.js";
import {
    buildMarketCatalogData,
    type EnrichedPairConfig,
    type MarketCatalogData,
    type MarketCatalogSeed,
} from "./market-data-catalog.js";
import { formatLedgerDecimal } from "./ledger-catalog.js";
import { formatToDecimals, int6ToDecimalString, intToDecimalString } from "./orders-catalog.js";
import {
    ZIPPER_ASSET_CATALOG,
    ZIPPER_CHAIN_CATALOG,
    ZIPPER_CONTRACTS_CATALOG,
} from "./zipper-catalog.generated.js";
import {
    buildZipperCatalogData,
    type ZipperCatalogData,
    type ZipperCatalogSeed,
    type ZipperContractName,
    type ZipperEnrichedAssetChain,
    type ZipperEnrichedAssetConfig,
} from "./zipper-catalog.js";

export type {
    EnrichedPairConfig,
    MarketCatalogData,
    MarketCatalogSeed,
} from "./market-data-catalog.js";
export type {
    ZipperCatalogData,
    ZipperCatalogSeed,
    ZipperContractName,
    ZipperEnrichedAssetChain,
    ZipperEnrichedAssetConfig,
} from "./zipper-catalog.js";
export {
    accountCodeNameFor,
    formatLedgerDecimal,
    LEDGER_SCALE,
    transferTypeNameFor,
} from "./ledger-catalog.js";
export {
    formatToDecimals,
    int6ToDecimalString,
    int18ToDecimalString,
    intToDecimalString,
} from "./orders-catalog.js";

export type PairCatalogKey = string | number;
export type AssetCatalogKey = string | number;
export type ChainCatalogKey = string | number;

export type CatalogLookupDomain = "market" | "ledger" | "orders" | "zipper";

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

export interface ParsedCatalogAmount {
    readonly value: bigint;
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
    ready(): Promise<CatalogSnapshot>;
    refresh(options?: CatalogRefreshOptions): Promise<CatalogSnapshot>;
}

export interface CatalogSnapshot {
    readonly source: "generated" | "api" | "custom";
    readonly loadedAtMs: number;
    readonly version: number;
    readonly market: MarketCatalogData;
    readonly zipper: ZipperCatalogData;
}

export type CatalogState =
    | { status: "generated" }
    | { status: "refreshing"; previousSource: CatalogSnapshot["source"] }
    | { status: "fresh"; source: "api" | "custom" }
    | { status: "stale"; source: CatalogSnapshot["source"]; error: unknown };

export interface CatalogRefreshOptions {
    force?: boolean;
}

export interface CatalogRefreshSource {
    market(): Promise<SpotConfig>;
    zipper(): Promise<DepositWithdrawConfig>;
}

export interface CreatePolyesterCatalogOptions {
    seed?: {
        market?: MarketCatalogSeed;
        zipper?: ZipperCatalogSeed;
    };
    refresh?: false | CatalogRefreshSource;
    source?: CatalogSnapshot["source"];
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

interface CatalogIndexes {
    readonly assetBySymbol: Map<string, AssetConfig>;
    readonly assetByLedgerId: Map<number, AssetConfig>;
    readonly pairBySymbol: Map<string, EnrichedPairConfig>;
    readonly pairBySymbolId: Map<number, EnrichedPairConfig>;
    readonly zipperChainByCode: Map<string, ZipperChainConfig>;
    readonly zipperChainById: Map<number, ZipperChainConfig>;
    readonly zipperAssetBySymbol: Map<string, ZipperEnrichedAssetConfig>;
    readonly zipperAssetByLedgerId: Map<number, ZipperEnrichedAssetConfig>;
    readonly zipperContractByName: Map<string, ZipperChainContractConfig>;
}

const indexesBySnapshot = new WeakMap<CatalogSnapshot, CatalogIndexes>();

const generatedSeed = {
    market: {
        assets: ASSET_CATALOG,
        pairs: PAIR_CATALOG,
    },
    zipper: {
        chains: ZIPPER_CHAIN_CATALOG,
        assets: ZIPPER_ASSET_CATALOG,
        contracts: ZIPPER_CONTRACTS_CATALOG,
    },
} satisfies Required<NonNullable<CreatePolyesterCatalogOptions["seed"]>>;

function buildCatalogSnapshot(params: {
    seed: Required<NonNullable<CreatePolyesterCatalogOptions["seed"]>>;
    source: CatalogSnapshot["source"];
    version: number;
    loadedAtMs?: number;
}): CatalogSnapshot {
    return Object.freeze({
        source: params.source,
        loadedAtMs: params.loadedAtMs ?? Date.now(),
        version: params.version,
        market: buildMarketCatalogData(params.seed.market),
        zipper: buildZipperCatalogData(params.seed.zipper),
    });
}

export function buildGeneratedCatalogSnapshot(): CatalogSnapshot {
    return buildCatalogSnapshot({
        seed: generatedSeed,
        source: "generated",
        version: 1,
    });
}

export function buildCustomCatalogSnapshot(
    seed: NonNullable<CreatePolyesterCatalogOptions["seed"]>,
): CatalogSnapshot {
    return buildCatalogSnapshot({
        seed: {
            market: seed.market ?? generatedSeed.market,
            zipper: seed.zipper ?? generatedSeed.zipper,
        },
        source: "custom",
        version: 1,
    });
}

function indexesFor(snapshot: CatalogSnapshot): CatalogIndexes {
    const existing = indexesBySnapshot.get(snapshot);
    if (existing) return existing;

    const indexes: CatalogIndexes = {
        assetBySymbol: new Map(snapshot.market.assets.map((asset) => [asset.symbol, asset])),
        assetByLedgerId: new Map(snapshot.market.assets.map((asset) => [asset.ledgerId, asset])),
        pairBySymbol: new Map(snapshot.market.pairs.map((pair) => [pair.symbol, pair])),
        pairBySymbolId: new Map(snapshot.market.pairs.map((pair) => [pair.symbolId, pair])),
        zipperChainByCode: new Map(snapshot.zipper.chains.map((chain) => [chain.code, chain])),
        zipperChainById: new Map(snapshot.zipper.chains.map((chain) => [chain.chainId, chain])),
        zipperAssetBySymbol: new Map(snapshot.zipper.assets.map((asset) => [asset.asset, asset])),
        zipperAssetByLedgerId: new Map(
            snapshot.zipper.assets.map((asset) => [asset.ledgerId, asset]),
        ),
        zipperContractByName: new Map(
            snapshot.zipper.contracts.map((contract) => [contract.name, contract]),
        ),
    };
    indexesBySnapshot.set(snapshot, indexes);
    return indexes;
}

function isListed(pair: EnrichedPairConfig, nowMs: number): boolean {
    if (pair.listingAt === null || pair.listingAt > nowMs) return false;
    if (pair.status === "disabled") return false;
    if (pair.delistingAt !== null && pair.delistingAt < nowMs) return false;
    return true;
}

function isEverListed(pair: EnrichedPairConfig, nowMs: number): boolean {
    return pair.listingAt !== null && pair.listingAt < nowMs;
}

function createReader(getSnapshot: () => CatalogSnapshot): CatalogReader {
    function snapshot(): CatalogSnapshot {
        return getSnapshot();
    }

    function getPair(pair: PairCatalogKey): EnrichedPairConfig | null {
        return typeof pair === "number"
            ? market.getPairBySymbolId(pair)
            : market.getPairBySymbol(pair);
    }

    function requirePair(
        pair: PairCatalogKey,
        domain: CatalogLookupDomain = "market",
    ): EnrichedPairConfig {
        const found = getPair(pair);
        if (!found)
            throw new CatalogLookupError(
                domain,
                typeof pair === "number" ? "symbolId" : "symbol",
                pair,
            );
        return found;
    }

    function getLedgerAsset(asset: AssetCatalogKey): AssetConfig | null {
        return typeof asset === "number"
            ? ledger.getAssetByLedgerId(asset)
            : ledger.getAssetBySymbol(asset);
    }

    function requireLedgerAsset(
        asset: AssetCatalogKey,
        domain: CatalogLookupDomain = "ledger",
    ): AssetConfig {
        const found = getLedgerAsset(asset);
        if (!found)
            throw new CatalogLookupError(
                domain,
                typeof asset === "number" ? "ledgerId" : "symbol",
                asset,
            );
        return found;
    }

    function getZipperChain(chain: ChainCatalogKey): ZipperChainConfig | null {
        return typeof chain === "number"
            ? zipper.getChainById(chain)
            : zipper.getChainByCode(chain);
    }

    const market: MarketCatalogReader = {
        listAssets: () => snapshot().market.assets,
        getAssetBySymbol: (assetSymbol) =>
            indexesFor(snapshot()).assetBySymbol.get(assetSymbol) ?? null,
        requireAssetBySymbol(assetSymbol) {
            const asset = this.getAssetBySymbol(assetSymbol);
            if (!asset) throw new CatalogLookupError("market", "assetSymbol", assetSymbol);
            return asset;
        },
        getAssetByLedgerId: (ledgerAssetId) =>
            indexesFor(snapshot()).assetByLedgerId.get(ledgerAssetId) ?? null,
        listPairs(filter) {
            const pairs = snapshot().market.pairs;
            if (!filter) return pairs;
            const nowMs = filter.atMs ?? Date.now();
            return pairs.filter((pair) => {
                if (filter.listed !== undefined && isListed(pair, nowMs) !== filter.listed)
                    return false;
                if (
                    filter.everListed !== undefined &&
                    isEverListed(pair, nowMs) !== filter.everListed
                )
                    return false;
                return true;
            });
        },
        getPairBySymbol: (pairSymbol) =>
            indexesFor(snapshot()).pairBySymbol.get(pairSymbol) ?? null,
        requirePairBySymbol(pairSymbol) {
            const pair = this.getPairBySymbol(pairSymbol);
            if (!pair) throw new CatalogLookupError("market", "pairSymbol", pairSymbol);
            return pair;
        },
        getSymbolIdByPairSymbol: (pairSymbol) =>
            market.getPairBySymbol(pairSymbol)?.symbolId ?? null,
        requireSymbolIdByPairSymbol(pairSymbol) {
            return market.requirePairBySymbol(pairSymbol).symbolId;
        },
        getPairBySymbolId: (pairSymbolId) =>
            indexesFor(snapshot()).pairBySymbolId.get(pairSymbolId) ?? null,
        requirePairBySymbolId(pairSymbolId) {
            const pair = this.getPairBySymbolId(pairSymbolId);
            if (!pair) throw new CatalogLookupError("market", "symbolId", pairSymbolId);
            return pair;
        },
        getPairSymbolBySymbolId: (pairSymbolId) =>
            market.getPairBySymbolId(pairSymbolId)?.symbol ?? null,
        requirePairSymbolBySymbolId(pairSymbolId) {
            return market.requirePairBySymbolId(pairSymbolId).symbol;
        },
    };

    const ledger: LedgerCatalogReader = {
        getAssetByLedgerId: (ledgerAssetId) => market.getAssetByLedgerId(ledgerAssetId),
        requireAssetByLedgerId(ledgerAssetId) {
            const asset = this.getAssetByLedgerId(ledgerAssetId);
            if (!asset) throw new CatalogLookupError("ledger", "ledgerId", ledgerAssetId);
            return asset;
        },
        getAssetBySymbol: (assetSymbol) => market.getAssetBySymbol(assetSymbol),
        requireAssetBySymbol(assetSymbol) {
            const asset = this.getAssetBySymbol(assetSymbol);
            if (!asset) throw new CatalogLookupError("ledger", "assetSymbol", assetSymbol);
            return asset;
        },
        getLedgerIdBySymbol: (assetSymbol) =>
            ledger.getAssetBySymbol(assetSymbol)?.ledgerId ?? null,
        requireLedgerIdBySymbol(assetSymbol) {
            return ledger.requireAssetBySymbol(assetSymbol).ledgerId;
        },
        requireSymbolByLedgerId(ledgerAssetId) {
            return ledger.requireAssetByLedgerId(ledgerAssetId).symbol;
        },
        parseAmount(amount, asset) {
            const config = requireLedgerAsset(asset, "ledger");
            const value = decimalToScaledInt(amount, config.quantityScale, "amount");
            return {
                value,
                scale: config.quantityScale,
                formatted: ledger.formatAmount(
                    intToDecimalString(value, config.quantityScale),
                    config.ledgerId,
                ),
            };
        },
        formatAmount(amount, asset) {
            const config = requireLedgerAsset(asset, "ledger");
            return formatLedgerDecimal(amount, config.quantityDisplayDecimals);
        },
        isKnownAssetId: (ledgerAssetId) =>
            ledgerAssetId !== 0 && ledger.getAssetByLedgerId(ledgerAssetId) !== null,
    };

    const orders: OrdersCatalogReader = {
        parseQuantity(quantity, pair) {
            const config = requirePair(pair, "orders");
            const value = decimalToScaledInt(quantity, config.baseAsset.quantityScale, "quantity");
            return {
                value,
                scale: config.baseAsset.quantityScale,
                formatted: orders.formatQuantity(value, config.symbolId),
            };
        },
        parsePrice(price, pair) {
            const config = requirePair(pair, "orders");
            const value = decimalToScaledInt(price, 6, "price");
            return {
                value,
                scale: 6,
                formatted: orders.formatPrice(value, config.symbolId),
            };
        },
        formatQuantity(quantity, pairSymbolId) {
            const pair = market.requirePairBySymbolId(pairSymbolId);
            const scale = pair.baseAsset.quantityScale;
            const decStr = intToDecimalString(quantity, scale);
            return formatToDecimals(decStr, pair.baseAsset.quantityDisplayDecimals, scale);
        },
        formatPrice(priceTicks, pairSymbolId) {
            market.requirePairBySymbolId(pairSymbolId);
            return int6ToDecimalString(priceTicks);
        },
        validateOrderInput(input) {
            const pair = requirePair(input.pair, "orders");
            const quantity = orders.parseQuantity(input.quantity, pair.symbolId).value;
            const step = decimalToScaledInt(
                pair.stepSize,
                pair.baseAsset.quantityScale,
                "stepSize",
            );
            const minQty = decimalToScaledInt(
                pair.minQtyBase,
                pair.baseAsset.quantityScale,
                "minQtyBase",
            );
            if (step > 0n && quantity % step !== 0n)
                throw new Error("quantity does not satisfy pair step size");
            if (quantity < minQty) throw new Error("quantity is below pair minimum");
            if (input.price !== undefined) {
                const price = orders.parsePrice(input.price, pair.symbolId).value;
                const tick = decimalToScaledInt(pair.tickSize, 6, "tickSize");
                if (tick > 0n && price % tick !== 0n)
                    throw new Error("price does not satisfy pair tick size");
            }
        },
        formatFee(feeScaled, pairSymbolId, feeSource) {
            const pair = market.requirePairBySymbolId(pairSymbolId);
            const asset =
                feeSource === 1 ? pair.quoteAsset : feeSource === 2 ? pair.baseAsset : undefined;
            if (!asset) throw new CatalogLookupError("orders", "feeSource", feeSource);
            const decimal = intToDecimalString(feeScaled, asset.quantityScale);
            return formatToDecimals(decimal, asset.quantityDisplayDecimals, asset.quantityScale);
        },
    };

    const zipper: ZipperCatalogReader = {
        listChains: () => snapshot().zipper.chains,
        getChainByCode: (chainCode) =>
            indexesFor(snapshot()).zipperChainByCode.get(chainCode) ?? null,
        requireChainByCode(chainCode) {
            const chain = this.getChainByCode(chainCode);
            if (!chain) throw new CatalogLookupError("zipper", "chainCode", chainCode);
            return chain;
        },
        getChainIdByCode: (chainCode) => zipper.getChainByCode(chainCode)?.chainId ?? null,
        requireChainIdByCode(chainCode) {
            return zipper.requireChainByCode(chainCode).chainId;
        },
        getChainById: (chainId) => indexesFor(snapshot()).zipperChainById.get(chainId) ?? null,
        requireChainById(chainId) {
            const chain = this.getChainById(chainId);
            if (!chain) throw new CatalogLookupError("zipper", "chainId", chainId);
            return chain;
        },
        listAssets: () => snapshot().zipper.assets,
        getAssetBySymbol: (assetSymbol) =>
            indexesFor(snapshot()).zipperAssetBySymbol.get(assetSymbol) ?? null,
        requireAssetBySymbol(assetSymbol) {
            const asset = this.getAssetBySymbol(assetSymbol);
            if (!asset) throw new CatalogLookupError("zipper", "assetSymbol", assetSymbol);
            return asset;
        },
        getAssetByLedgerId: (ledgerAssetId) =>
            indexesFor(snapshot()).zipperAssetByLedgerId.get(ledgerAssetId) ?? null,
        requireAssetByLedgerId(ledgerAssetId) {
            const asset = this.getAssetByLedgerId(ledgerAssetId);
            if (!asset) throw new CatalogLookupError("zipper", "ledgerId", ledgerAssetId);
            return asset;
        },
        getAssetChain(asset, chain) {
            const zipperAsset =
                typeof asset === "number"
                    ? zipper.getAssetByLedgerId(asset)
                    : zipper.getAssetBySymbol(asset);
            const zipperChain = getZipperChain(chain);
            if (!zipperAsset || !zipperChain) return null;
            const route = zipperAsset.chains.find(
                (candidate) => candidate.chainId === zipperChain.chainId,
            );
            return route ? { asset: zipperAsset, chain: route } : null;
        },
        requireAssetChain(asset, chain) {
            const route = this.getAssetChain(asset, chain);
            if (!route)
                throw new CatalogLookupError(
                    "zipper",
                    "assetChain",
                    `${String(asset)}:${String(chain)}`,
                );
            return route;
        },
        listContracts: () => snapshot().zipper.contracts,
        getContractByName: (contractName) =>
            indexesFor(snapshot()).zipperContractByName.get(contractName) ?? null,
        requireContractByName(contractName) {
            const contract = this.getContractByName(contractName);
            if (!contract) throw new CatalogLookupError("zipper", "contractName", contractName);
            return contract;
        },
    };

    return { market, ledger, orders, zipper, snapshot };
}

export function createCatalogSnapshotReader(snapshot: CatalogSnapshot): CatalogReader {
    return createReader(() => snapshot);
}

export function createPolyesterCatalog(options: CreatePolyesterCatalogOptions = {}): ClientCatalog {
    const initialSource: CatalogSnapshot["source"] =
        options.source ?? (options.seed ? "custom" : "generated");
    let current = buildCatalogSnapshot({
        seed: {
            market: options.seed?.market ?? generatedSeed.market,
            zipper: options.seed?.zipper ?? generatedSeed.zipper,
        },
        source: initialSource,
        version: 1,
    });
    let stateValue: CatalogState =
        initialSource === "generated"
            ? { status: "generated" }
            : { status: "fresh", source: "custom" };
    let refreshInFlight: Promise<CatalogSnapshot> | undefined;
    let readyPromise: Promise<CatalogSnapshot> | undefined;

    const reader = createReader(() => current);

    function runRefresh(): Promise<CatalogSnapshot> {
        if (options.refresh === false || options.refresh === undefined) {
            return Promise.resolve(current);
        }
        if (refreshInFlight) return refreshInFlight;

        stateValue = { status: "refreshing", previousSource: current.source };
        refreshInFlight = Promise.all([options.refresh.market(), options.refresh.zipper()])
            .then(([marketSeed, zipperSeed]) => {
                current = buildCatalogSnapshot({
                    seed: { market: marketSeed, zipper: zipperSeed },
                    source: "api",
                    version: current.version + 1,
                });
                stateValue = { status: "fresh", source: "api" };
                return current;
            })
            .catch((error) => {
                stateValue = { status: "stale", source: current.source, error };
                throw error;
            })
            .finally(() => {
                refreshInFlight = undefined;
            });

        readyPromise ??= refreshInFlight.catch(() => current);
        return refreshInFlight;
    }

    return {
        ...reader,
        state: () => stateValue,
        ready: () => readyPromise ?? Promise.resolve(current),
        refresh: () => runRefresh(),
    };
}

const generatedSnapshot = buildGeneratedCatalogSnapshot();
export const staticCatalog: CatalogReader = createReader(() => generatedSnapshot);
