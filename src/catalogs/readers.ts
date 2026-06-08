import { decimalToScaledInt } from "../utils/numbers.js";
import type { AssetConfig, ZipperChainConfig } from "./config-types.js";
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

export function createReader(getSnapshot: () => CatalogSnapshot): CatalogReader {
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
