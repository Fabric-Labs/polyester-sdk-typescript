import * as ProtoOrders from "../gen/orders/v1/orders_pb.js";
import { decimalToScaledInt } from "../utils/numbers.js";
import type { AssetConfig, ZipperChainConfig } from "../shared/catalog-config.js";
import { indexesFor } from "./indexes.js";
import { formatLedgerDecimal } from "./ledger-catalog.js";
import type { EnrichedPairConfig } from "./market-data-catalog.js";
import { formatToDecimals, int6ToDecimalString, intToDecimalString } from "./orders-catalog.js";
import {
    CatalogLookupError,
    type AssetCatalogKey,
    type CatalogLookupDomain,
    type CatalogReader,
    type CatalogSnapshot,
    type ChainCatalogKey,
    type LedgerCatalogReader,
    type MarketCatalogReader,
    type OrdersCatalogReader,
    type PairCatalogKey,
    type ZipperCatalogReader,
} from "./types.js";

function isListed(pair: EnrichedPairConfig, nowMs: number): boolean {
    if (pair.listingAt === null || pair.listingAt > nowMs) return false;
    if (pair.status === "disabled") return false;
    if (pair.delistingAt !== null && pair.delistingAt < nowMs) return false;
    return true;
}

function isEverListed(pair: EnrichedPairConfig, nowMs: number): boolean {
    return pair.listingAt !== null && pair.listingAt < nowMs;
}

type SnapshotGetter = () => CatalogSnapshot;

function requireCatalogValue<T>(
    domain: CatalogLookupDomain,
    lookup: string,
    value: string | number,
    found: T | null,
): T {
    if (found === null) throw new CatalogLookupError(domain, lookup, value);
    return found;
}

function getPair(market: MarketCatalogReader, pair: PairCatalogKey): EnrichedPairConfig | null {
    return typeof pair === "number" ? market.getPairBySymbolId(pair) : market.getPairBySymbol(pair);
}

function requirePair(
    market: MarketCatalogReader,
    pair: PairCatalogKey,
    domain: CatalogLookupDomain = "market",
): EnrichedPairConfig {
    return requireCatalogValue(
        domain,
        typeof pair === "number" ? "symbolId" : "symbol",
        pair,
        getPair(market, pair),
    );
}

function getLedgerAsset(ledger: LedgerCatalogReader, asset: AssetCatalogKey): AssetConfig | null {
    return typeof asset === "number"
        ? ledger.getAssetByLedgerId(asset)
        : ledger.getAssetBySymbol(asset);
}

function requireLedgerAsset(
    ledger: LedgerCatalogReader,
    asset: AssetCatalogKey,
    domain: CatalogLookupDomain = "ledger",
): AssetConfig {
    return requireCatalogValue(
        domain,
        typeof asset === "number" ? "ledgerId" : "symbol",
        asset,
        getLedgerAsset(ledger, asset),
    );
}

function getZipperChain(
    zipper: ZipperCatalogReader,
    chain: ChainCatalogKey,
): ZipperChainConfig | null {
    return typeof chain === "number" ? zipper.getChainById(chain) : zipper.getChainByCode(chain);
}

class MarketReader implements MarketCatalogReader {
    constructor(private readonly getSnapshot: SnapshotGetter) {}

    listAssets(): readonly AssetConfig[] {
        return this.getSnapshot().market.assets;
    }

    getAssetBySymbol(assetSymbol: string): AssetConfig | null {
        return indexesFor(this.getSnapshot()).assetBySymbol.get(assetSymbol) ?? null;
    }

    requireAssetBySymbol(assetSymbol: string): AssetConfig {
        const asset = this.getAssetBySymbol(assetSymbol);
        if (!asset) throw new CatalogLookupError("market", "assetSymbol", assetSymbol);
        return asset;
    }

    getAssetByLedgerId(ledgerAssetId: number): AssetConfig | null {
        return indexesFor(this.getSnapshot()).assetByLedgerId.get(ledgerAssetId) ?? null;
    }

    listPairs(filter?: {
        listed?: boolean;
        everListed?: boolean;
        atMs?: number;
    }): readonly EnrichedPairConfig[] {
        const pairs = this.getSnapshot().market.pairs;
        if (!filter) return pairs;
        const nowMs = filter.atMs ?? Date.now();
        return pairs.filter((pair) => {
            if (filter.listed !== undefined && isListed(pair, nowMs) !== filter.listed)
                return false;
            if (filter.everListed !== undefined && isEverListed(pair, nowMs) !== filter.everListed)
                return false;
            return true;
        });
    }

    getPairBySymbol(pairSymbol: string): EnrichedPairConfig | null {
        return indexesFor(this.getSnapshot()).pairBySymbol.get(pairSymbol) ?? null;
    }

    requirePairBySymbol(pairSymbol: string): EnrichedPairConfig {
        const pair = this.getPairBySymbol(pairSymbol);
        if (!pair) throw new CatalogLookupError("market", "pairSymbol", pairSymbol);
        return pair;
    }

    getSymbolIdByPairSymbol(pairSymbol: string): number | null {
        return this.getPairBySymbol(pairSymbol)?.symbolId ?? null;
    }

    requireSymbolIdByPairSymbol(pairSymbol: string): number {
        return this.requirePairBySymbol(pairSymbol).symbolId;
    }

    getPairBySymbolId(pairSymbolId: number): EnrichedPairConfig | null {
        return indexesFor(this.getSnapshot()).pairBySymbolId.get(pairSymbolId) ?? null;
    }

    requirePairBySymbolId(pairSymbolId: number): EnrichedPairConfig {
        const pair = this.getPairBySymbolId(pairSymbolId);
        if (!pair) throw new CatalogLookupError("market", "symbolId", pairSymbolId);
        return pair;
    }

    getPairSymbolBySymbolId(pairSymbolId: number): string | null {
        return this.getPairBySymbolId(pairSymbolId)?.symbol ?? null;
    }

    requirePairSymbolBySymbolId(pairSymbolId: number): string {
        return this.requirePairBySymbolId(pairSymbolId).symbol;
    }
}

class LedgerReader implements LedgerCatalogReader {
    constructor(private readonly market: MarketCatalogReader) {}

    getAssetByLedgerId(ledgerAssetId: number): AssetConfig | null {
        return this.market.getAssetByLedgerId(ledgerAssetId);
    }

    requireAssetByLedgerId(ledgerAssetId: number): AssetConfig {
        const asset = this.getAssetByLedgerId(ledgerAssetId);
        if (!asset) throw new CatalogLookupError("ledger", "ledgerId", ledgerAssetId);
        return asset;
    }

    getAssetBySymbol(assetSymbol: string): AssetConfig | null {
        return this.market.getAssetBySymbol(assetSymbol);
    }

    requireAssetBySymbol(assetSymbol: string): AssetConfig {
        const asset = this.getAssetBySymbol(assetSymbol);
        if (!asset) throw new CatalogLookupError("ledger", "assetSymbol", assetSymbol);
        return asset;
    }

    getLedgerIdBySymbol(assetSymbol: string): number | null {
        return this.getAssetBySymbol(assetSymbol)?.ledgerId ?? null;
    }

    requireLedgerIdBySymbol(assetSymbol: string): number {
        return this.requireAssetBySymbol(assetSymbol).ledgerId;
    }

    requireSymbolByLedgerId(ledgerAssetId: number): string {
        return this.requireAssetByLedgerId(ledgerAssetId).symbol;
    }

    parseAmount(amount: string, asset: AssetCatalogKey) {
        const config = requireLedgerAsset(this, asset, "ledger");
        const value = decimalToScaledInt(amount, config.quantityScale, "amount");
        return {
            value: value.toString(),
            scale: config.quantityScale,
            formatted: this.formatAmount(
                intToDecimalString(value, config.quantityScale),
                config.ledgerId,
            ),
        };
    }

    formatAmount(amount: string, asset: AssetCatalogKey): string {
        const config = requireLedgerAsset(this, asset, "ledger");
        return formatLedgerDecimal(amount, config.quantityDisplayDecimals);
    }

    isKnownAssetId(ledgerAssetId: number): boolean {
        return ledgerAssetId !== 0 && this.getAssetByLedgerId(ledgerAssetId) !== null;
    }
}

class OrdersReader implements OrdersCatalogReader {
    constructor(private readonly market: MarketCatalogReader) {}

    parseQuantity(quantity: string, pair: PairCatalogKey) {
        const config = requirePair(this.market, pair, "orders");
        const value = decimalToScaledInt(quantity, config.baseAsset.quantityScale, "quantity");
        return {
            value: value.toString(),
            scale: config.baseAsset.quantityScale,
            formatted: this.formatQuantity(value, config.symbolId),
        };
    }

    parsePrice(price: string, pair: PairCatalogKey) {
        const config = requirePair(this.market, pair, "orders");
        const value = decimalToScaledInt(price, 6, "price");
        return {
            value: value.toString(),
            scale: 6,
            formatted: this.formatPrice(value, config.symbolId),
        };
    }

    formatQuantity(quantity: bigint | number | string, pairSymbolId: number): string {
        const pair = this.market.requirePairBySymbolId(pairSymbolId);
        const scale = pair.baseAsset.quantityScale;
        const decStr = intToDecimalString(quantity, scale);
        return formatToDecimals(decStr, pair.baseAsset.quantityDisplayDecimals, scale);
    }

    formatPrice(priceTicks: bigint | number | string, pairSymbolId: number): string {
        this.market.requirePairBySymbolId(pairSymbolId);
        return int6ToDecimalString(priceTicks);
    }

    validateOrderInput(input: { pair: PairCatalogKey; quantity: string; price?: string }): void {
        const pair = requirePair(this.market, input.pair, "orders");
        const quantity = BigInt(this.parseQuantity(input.quantity, pair.symbolId).value);
        const step = decimalToScaledInt(pair.stepSize, pair.baseAsset.quantityScale, "stepSize");
        const minQty = decimalToScaledInt(
            pair.minQtyBase,
            pair.baseAsset.quantityScale,
            "minQtyBase",
        );
        if (step > 0n && quantity % step !== 0n)
            throw new Error("quantity does not satisfy pair step size");
        if (quantity < minQty) throw new Error("quantity is below pair minimum");
        if (input.price !== undefined) {
            const price = BigInt(this.parsePrice(input.price, pair.symbolId).value);
            const tick = decimalToScaledInt(pair.tickSize, 6, "tickSize");
            if (tick > 0n && price % tick !== 0n)
                throw new Error("price does not satisfy pair tick size");
        }
    }

    formatFee(
        feeScaled: bigint | number | string,
        pairSymbolId: number,
        feeSource: number,
    ): string {
        const pair = this.market.requirePairBySymbolId(pairSymbolId);
        let asset: AssetConfig | undefined;
        switch (feeSource) {
            case ProtoOrders.FeeSource.QUOTE:
                asset = pair.quoteAsset;
                break;
            case ProtoOrders.FeeSource.RECEIVED:
                asset = pair.baseAsset;
                break;
        }
        if (!asset) throw new CatalogLookupError("orders", "feeSource", feeSource);
        const decimal = intToDecimalString(feeScaled, asset.quantityScale);
        return formatToDecimals(decimal, asset.quantityDisplayDecimals, asset.quantityScale);
    }
}

class ZipperReader implements ZipperCatalogReader {
    constructor(private readonly getSnapshot: SnapshotGetter) {}

    listChains(): readonly ZipperChainConfig[] {
        return this.getSnapshot().zipper.chains;
    }

    getChainByCode(chainCode: string): ZipperChainConfig | null {
        return indexesFor(this.getSnapshot()).zipperChainByCode.get(chainCode) ?? null;
    }

    requireChainByCode(chainCode: string): ZipperChainConfig {
        const chain = this.getChainByCode(chainCode);
        if (!chain) throw new CatalogLookupError("zipper", "chainCode", chainCode);
        return chain;
    }

    getChainIdByCode(chainCode: string): number | null {
        return this.getChainByCode(chainCode)?.chainId ?? null;
    }

    requireChainIdByCode(chainCode: string): number {
        return this.requireChainByCode(chainCode).chainId;
    }

    getChainById(chainId: number): ZipperChainConfig | null {
        return indexesFor(this.getSnapshot()).zipperChainById.get(chainId) ?? null;
    }

    requireChainById(chainId: number): ZipperChainConfig {
        const chain = this.getChainById(chainId);
        if (!chain) throw new CatalogLookupError("zipper", "chainId", chainId);
        return chain;
    }

    listAssets() {
        return this.getSnapshot().zipper.assets;
    }

    getAssetBySymbol(assetSymbol: string) {
        return indexesFor(this.getSnapshot()).zipperAssetBySymbol.get(assetSymbol) ?? null;
    }

    requireAssetBySymbol(assetSymbol: string) {
        const asset = this.getAssetBySymbol(assetSymbol);
        if (!asset) throw new CatalogLookupError("zipper", "assetSymbol", assetSymbol);
        return asset;
    }

    getAssetByLedgerId(ledgerAssetId: number) {
        return indexesFor(this.getSnapshot()).zipperAssetByLedgerId.get(ledgerAssetId) ?? null;
    }

    requireAssetByLedgerId(ledgerAssetId: number) {
        const asset = this.getAssetByLedgerId(ledgerAssetId);
        if (!asset) throw new CatalogLookupError("zipper", "ledgerId", ledgerAssetId);
        return asset;
    }

    getAssetChain(asset: AssetCatalogKey, chain: ChainCatalogKey) {
        const zipperAsset =
            typeof asset === "number"
                ? this.getAssetByLedgerId(asset)
                : this.getAssetBySymbol(asset);
        const zipperChain = getZipperChain(this, chain);
        if (!zipperAsset || !zipperChain) return null;
        const route = zipperAsset.chains.find(
            (candidate) => candidate.chainId === zipperChain.chainId,
        );
        return route ? { asset: zipperAsset, chain: route } : null;
    }

    requireAssetChain(asset: AssetCatalogKey, chain: ChainCatalogKey) {
        const route = this.getAssetChain(asset, chain);
        if (!route)
            throw new CatalogLookupError(
                "zipper",
                "assetChain",
                `${String(asset)}:${String(chain)}`,
            );
        return route;
    }

    listContracts() {
        return this.getSnapshot().zipper.contracts;
    }

    getContractByName(contractName: string) {
        return indexesFor(this.getSnapshot()).zipperContractByName.get(contractName) ?? null;
    }

    requireContractByName(contractName: string) {
        const contract = this.getContractByName(contractName);
        if (!contract) throw new CatalogLookupError("zipper", "contractName", contractName);
        return contract;
    }
}

class SnapshotCatalogReader implements CatalogReader {
    readonly market: MarketCatalogReader;
    readonly ledger: LedgerCatalogReader;
    readonly orders: OrdersCatalogReader;
    readonly zipper: ZipperCatalogReader;
    readonly snapshot: () => CatalogSnapshot;

    constructor(private readonly getSnapshot: SnapshotGetter) {
        this.market = new MarketReader(getSnapshot);
        this.ledger = new LedgerReader(this.market);
        this.orders = new OrdersReader(this.market);
        this.zipper = new ZipperReader(getSnapshot);
        this.snapshot = () => this.getSnapshot();
    }
}

export function createReader(getSnapshot: () => CatalogSnapshot): CatalogReader {
    return new SnapshotCatalogReader(getSnapshot);
}

export function createCatalogSnapshotReader(snapshot: CatalogSnapshot): CatalogReader {
    return createReader(() => snapshot);
}
