import type {
    AssetConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
} from "../shared/catalog-config.js";
import {
    scaledToDecimal,
    scaledToDisplay,
    significantDecimalPlaces,
    tryDecimalToScaled,
    tryNormalizeDecimalInput,
    tryToScaledBigInt,
    type DecimalToScaledFailure,
    type ScaledIntegerLike,
} from "./decimal.js";
import { indexesFor } from "./indexes.js";
import type { EnrichedPairConfig } from "./market-data-catalog.js";
import {
    resolveLedgerAssetByLedgerId,
    resolveZipperAssetByLedgerId,
    UNKNOWN_LEDGER_ASSET_ID,
} from "./unknown-asset.js";
import type { ZipperContractName, ZipperEnrichedAssetConfig } from "./zipper-catalog.js";
import {
    CatalogConversionError,
    CatalogLookupError,
    CatalogValidationFailedError,
    type AssetCatalogKey,
    type CatalogLookupDomain,
    type CatalogReader,
    type CatalogSnapshot,
    type CatalogValidationError,
    type CatalogValidationResult,
    type ChainCatalogKey,
    type LedgerCatalogReader,
    type MarketCatalogReader,
    type OrdersCatalogReader,
    type PairCatalogKey,
    type ParsedCatalogAmount,
    type SpotOrderConstraints,
    type SpotOrderDecimalInput,
    type ZipperAssetChainRoute,
    type ZipperCatalogReader,
} from "./types.js";
import { parseCatalogSnapshot } from "./snapshot-validation.js";
import { PROTOBUF_INT32_MAX, PROTOBUF_INT64_MAX } from "../shared/wire-bounds.js";

/** Price ticks are always quoted at 6 decimal places. */
export const PRICE_SCALE = 6;

type SnapshotGetter = () => CatalogSnapshot;

function isListed(pair: EnrichedPairConfig, nowMs: number): boolean {
    if (pair.listingAt === null || pair.listingAt > nowMs) return false;
    if (pair.status === "disabled") return false;
    if (pair.delistingAt !== null && pair.delistingAt < nowMs) return false;
    return true;
}

function isEverListed(pair: EnrichedPairConfig, nowMs: number): boolean {
    return pair.listingAt !== null && pair.listingAt < nowMs;
}

function requireFound<T>(
    domain: CatalogLookupDomain,
    lookup: string,
    value: string | number,
    found: T | null,
): T {
    if (found === null) throw new CatalogLookupError(domain, lookup, value);
    return found;
}

type ResolvedKey<TByName extends string, TById extends string> =
    | { lookup: TByName; value: string }
    | { lookup: TById; value: number };

function resolvePairKey(key: PairCatalogKey): ResolvedKey<"symbol", "symbolId"> {
    if (typeof key === "string") return { lookup: "symbol", value: key };
    if (typeof key === "number") return { lookup: "symbolId", value: key };
    if ("symbol" in key) return { lookup: "symbol", value: key.symbol };
    return { lookup: "symbolId", value: key.symbolId };
}

function resolveAssetKey(key: AssetCatalogKey): ResolvedKey<"symbol", "ledgerId"> {
    if (typeof key === "string") return { lookup: "symbol", value: key };
    if (typeof key === "number") return { lookup: "ledgerId", value: key };
    if ("symbol" in key) return { lookup: "symbol", value: key.symbol };
    return { lookup: "ledgerId", value: key.ledgerId };
}

function resolveChainKey(key: ChainCatalogKey): ResolvedKey<"chainCode", "chainId"> {
    if (typeof key === "string") return { lookup: "chainCode", value: key };
    if (typeof key === "number") return { lookup: "chainId", value: key };
    if ("code" in key) return { lookup: "chainCode", value: key.code };
    return { lookup: "chainId", value: key.chainId };
}

function conversionFailureMessage(
    field: string,
    value: string,
    failure: DecimalToScaledFailure,
): string {
    return failure.reason === "precision"
        ? `${field} supports at most ${failure.maxDecimals} decimal places: ${value}`
        : `${field} must be a non-negative decimal number: ${value}`;
}

/** Shared conversion core used by the market and ledger readers. */
class DecimalConverter {
    constructor(
        readonly field: string,
        readonly scale: number,
        readonly displayDecimals: number,
    ) {}

    parse(decimal: string): ParsedCatalogAmount {
        const result = tryDecimalToScaled(decimal, this.scale);
        if (!result.ok) {
            throw new CatalogConversionError(
                this.field,
                conversionFailureMessage(this.field, decimal, result.failure),
            );
        }
        return {
            scaledValue: result.scaled.toString(),
            decimal: scaledToDecimal(result.scaled, this.scale),
            display: scaledToDisplay(result.scaled, this.scale, this.displayDecimals),
            scale: this.scale,
        };
    }

    normalizeInput(raw: string): string {
        const normalized = tryNormalizeDecimalInput(raw, this.scale);
        if (normalized === null) {
            throw new CatalogConversionError(
                this.field,
                `${this.field} must be a non-negative decimal number: ${raw}`,
            );
        }
        return normalized;
    }

    toDecimalString(scaled: ScaledIntegerLike): string {
        return scaledToDecimal(this.toBigInt(scaled), this.scale);
    }

    toDisplayString(scaled: ScaledIntegerLike): string {
        return scaledToDisplay(this.toBigInt(scaled), this.scale, this.displayDecimals);
    }

    formatDecimal(decimal: string): string {
        const result = tryDecimalToScaled(decimal.trim(), this.scale);
        if (!result.ok) {
            throw new CatalogConversionError(
                this.field,
                conversionFailureMessage(this.field, decimal, result.failure),
            );
        }
        return scaledToDisplay(result.scaled, this.scale, this.displayDecimals);
    }

    private toBigInt(scaled: ScaledIntegerLike): bigint {
        const value = tryToScaledBigInt(scaled);
        if (value === null) {
            throw new CatalogConversionError(
                this.field,
                `${this.field} must be a raw scaled integer: ${String(scaled)}`,
            );
        }
        return value;
    }
}

function priceConverter(pair: EnrichedPairConfig): DecimalConverter {
    const tickDecimals = significantDecimalPlaces(pair.tickSize);
    const displayDecimals = tickDecimals > 0 ? tickDecimals : PRICE_SCALE;
    return new DecimalConverter("price", PRICE_SCALE, displayDecimals);
}

function quantityConverter(pair: EnrichedPairConfig): DecimalConverter {
    return new DecimalConverter(
        "quantity",
        pair.baseAsset.quantityScale,
        pair.baseAsset.quantityDisplayDecimals,
    );
}

function quoteAmountConverter(pair: EnrichedPairConfig): DecimalConverter {
    return new DecimalConverter(
        "quoteAmount",
        pair.quoteAsset.quantityScale,
        pair.quoteAsset.quantityDisplayDecimals,
    );
}

function ledgerAmountConverter(asset: AssetConfig): DecimalConverter {
    return new DecimalConverter("amount", asset.quantityScale, asset.quantityDisplayDecimals);
}

class MarketReader implements MarketCatalogReader {
    constructor(private readonly getSnapshot: SnapshotGetter) {}

    listAssets(): readonly AssetConfig[] {
        return this.getSnapshot().market.assets;
    }

    getAsset(asset: AssetCatalogKey): AssetConfig | null {
        const key = resolveAssetKey(asset);
        return key.lookup === "symbol"
            ? this.getAssetBySymbol(key.value)
            : this.getAssetByLedgerId(key.value);
    }

    requireAsset(asset: AssetCatalogKey): AssetConfig {
        const key = resolveAssetKey(asset);
        return requireFound("market", key.lookup, key.value, this.getAsset(asset));
    }

    getAssetBySymbol(assetSymbol: string): AssetConfig | null {
        return indexesFor(this.getSnapshot()).assetBySymbol.get(assetSymbol) ?? null;
    }

    requireAssetBySymbol(assetSymbol: string): AssetConfig {
        return requireFound("market", "symbol", assetSymbol, this.getAssetBySymbol(assetSymbol));
    }

    getAssetByLedgerId(ledgerAssetId: number): AssetConfig {
        return resolveLedgerAssetByLedgerId(ledgerAssetId, (id) => this.lookupAssetByLedgerId(id));
    }

    lookupAssetByLedgerId(ledgerAssetId: number): AssetConfig | null {
        return indexesFor(this.getSnapshot()).assetByLedgerId.get(ledgerAssetId) ?? null;
    }

    requireAssetByLedgerId(ledgerAssetId: number): AssetConfig {
        return this.getAssetByLedgerId(ledgerAssetId);
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

    getPair(pair: PairCatalogKey): EnrichedPairConfig | null {
        const key = resolvePairKey(pair);
        return key.lookup === "symbol"
            ? this.getPairBySymbol(key.value)
            : this.getPairBySymbolId(key.value);
    }

    requirePair(pair: PairCatalogKey): EnrichedPairConfig {
        const key = resolvePairKey(pair);
        return requireFound("market", key.lookup, key.value, this.getPair(pair));
    }

    getPairBySymbol(pairSymbol: string): EnrichedPairConfig | null {
        return indexesFor(this.getSnapshot()).pairBySymbol.get(pairSymbol) ?? null;
    }

    requirePairBySymbol(pairSymbol: string): EnrichedPairConfig {
        return requireFound("market", "symbol", pairSymbol, this.getPairBySymbol(pairSymbol));
    }

    getPairBySymbolId(pairSymbolId: number): EnrichedPairConfig | null {
        return indexesFor(this.getSnapshot()).pairBySymbolId.get(pairSymbolId) ?? null;
    }

    requirePairBySymbolId(pairSymbolId: number): EnrichedPairConfig {
        return requireFound(
            "market",
            "symbolId",
            pairSymbolId,
            this.getPairBySymbolId(pairSymbolId),
        );
    }

    getSymbolIdByPairSymbol(pairSymbol: string): number | null {
        return this.getPairBySymbol(pairSymbol)?.symbolId ?? null;
    }

    requireSymbolIdByPairSymbol(pairSymbol: string): number {
        return this.requirePairBySymbol(pairSymbol).symbolId;
    }

    getPairSymbolBySymbolId(pairSymbolId: number): string | null {
        return this.getPairBySymbolId(pairSymbolId)?.symbol ?? null;
    }

    requirePairSymbolBySymbolId(pairSymbolId: number): string {
        return this.requirePairBySymbolId(pairSymbolId).symbol;
    }

    decimalPriceToTicks(price: string, pair: PairCatalogKey): ParsedCatalogAmount {
        return priceConverter(this.requirePair(pair)).parse(price);
    }

    normalizePriceInput(price: string, pair: PairCatalogKey): string {
        return priceConverter(this.requirePair(pair)).normalizeInput(price);
    }

    priceTicksToDecimalString(priceTicks: ScaledIntegerLike, pair: PairCatalogKey): string {
        return priceConverter(this.requirePair(pair)).toDecimalString(priceTicks);
    }

    priceTicksToDisplayString(priceTicks: ScaledIntegerLike, pair: PairCatalogKey): string {
        return priceConverter(this.requirePair(pair)).toDisplayString(priceTicks);
    }

    formatPrice(price: string, pair: PairCatalogKey): string {
        return priceConverter(this.requirePair(pair)).formatDecimal(price);
    }

    decimalQuantityToScaled(quantity: string, pair: PairCatalogKey): ParsedCatalogAmount {
        return quantityConverter(this.requirePair(pair)).parse(quantity);
    }

    normalizeQuantityInput(quantity: string, pair: PairCatalogKey): string {
        return quantityConverter(this.requirePair(pair)).normalizeInput(quantity);
    }

    quantityScaledToDecimalString(quantityScaled: ScaledIntegerLike, pair: PairCatalogKey): string {
        return quantityConverter(this.requirePair(pair)).toDecimalString(quantityScaled);
    }

    quantityScaledToDisplayString(quantityScaled: ScaledIntegerLike, pair: PairCatalogKey): string {
        return quantityConverter(this.requirePair(pair)).toDisplayString(quantityScaled);
    }

    formatQuantity(quantity: string, pair: PairCatalogKey): string {
        return quantityConverter(this.requirePair(pair)).formatDecimal(quantity);
    }

    decimalQuoteAmountToScaled(amount: string, pair: PairCatalogKey): ParsedCatalogAmount {
        return quoteAmountConverter(this.requirePair(pair)).parse(amount);
    }

    normalizeQuoteAmountInput(amount: string, pair: PairCatalogKey): string {
        return quoteAmountConverter(this.requirePair(pair)).normalizeInput(amount);
    }

    quoteAmountScaledToDecimalString(
        amountScaled: ScaledIntegerLike,
        pair: PairCatalogKey,
    ): string {
        return quoteAmountConverter(this.requirePair(pair)).toDecimalString(amountScaled);
    }

    quoteAmountScaledToDisplayString(
        amountScaled: ScaledIntegerLike,
        pair: PairCatalogKey,
    ): string {
        return quoteAmountConverter(this.requirePair(pair)).toDisplayString(amountScaled);
    }

    formatQuoteAmount(amount: string, pair: PairCatalogKey): string {
        return quoteAmountConverter(this.requirePair(pair)).formatDecimal(amount);
    }
}

class LedgerReader implements LedgerCatalogReader {
    constructor(private readonly market: MarketReader) {}

    getAssetByLedgerId(ledgerAssetId: number): AssetConfig {
        return this.market.getAssetByLedgerId(ledgerAssetId);
    }

    requireAssetByLedgerId(ledgerAssetId: number): AssetConfig {
        return this.getAssetByLedgerId(ledgerAssetId);
    }

    getAssetBySymbol(assetSymbol: string): AssetConfig | null {
        return this.market.getAssetBySymbol(assetSymbol);
    }

    requireAssetBySymbol(assetSymbol: string): AssetConfig {
        return requireFound("ledger", "symbol", assetSymbol, this.getAssetBySymbol(assetSymbol));
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

    isKnownAssetId(ledgerAssetId: number): boolean {
        if (!Number.isInteger(ledgerAssetId) || ledgerAssetId <= 0) return false;
        if (ledgerAssetId === UNKNOWN_LEDGER_ASSET_ID) return false;
        return this.market.lookupAssetByLedgerId(ledgerAssetId) !== null;
    }

    decimalAmountToScaled(amount: string, asset: AssetCatalogKey): ParsedCatalogAmount {
        return ledgerAmountConverter(this.requireAsset(asset)).parse(amount);
    }

    normalizeAmountInput(amount: string, asset: AssetCatalogKey): string {
        return ledgerAmountConverter(this.requireAsset(asset)).normalizeInput(amount);
    }

    amountScaledToDecimalString(amountScaled: ScaledIntegerLike, asset: AssetCatalogKey): string {
        return ledgerAmountConverter(this.requireAsset(asset)).toDecimalString(amountScaled);
    }

    amountScaledToDisplayString(amountScaled: ScaledIntegerLike, asset: AssetCatalogKey): string {
        return ledgerAmountConverter(this.requireAsset(asset)).toDisplayString(amountScaled);
    }

    formatAmount(amount: string, asset: AssetCatalogKey): string {
        return ledgerAmountConverter(this.requireAsset(asset)).formatDecimal(amount);
    }

    private requireAsset(asset: AssetCatalogKey): AssetConfig {
        const key = resolveAssetKey(asset);
        const found =
            key.lookup === "symbol"
                ? this.getAssetBySymbol(key.value)
                : this.getAssetByLedgerId(key.value);
        return requireFound("ledger", key.lookup, key.value, found);
    }
}

class OrdersReader implements OrdersCatalogReader {
    constructor(private readonly market: MarketReader) {}

    getSpotOrderConstraints(pair: PairCatalogKey): SpotOrderConstraints {
        const config = this.market.requirePair(pair);
        const priceScale = PRICE_SCALE;
        const quantityScale = config.baseAsset.quantityScale;
        const quoteAmountScale = config.quoteAsset.quantityScale;
        return {
            symbolId: config.symbolId,
            symbol: config.symbol,
            status: config.status,
            tickSize: config.tickSize,
            stepSize: config.stepSize,
            minQtyBase: config.minQtyBase,
            minNotionalQuote: config.minNotionalQuote,
            maxPrice: scaledToDecimal(PROTOBUF_INT64_MAX, priceScale),
            maxQtyBase: scaledToDecimal(PROTOBUF_INT64_MAX, quantityScale),
            maxNotionalQuote: scaledToDecimal(PROTOBUF_INT64_MAX, quoteAmountScale),
            maxQuoteSlippage: scaledToDecimal(PROTOBUF_INT32_MAX, priceScale),
            priceScale,
            quantityScale,
            quoteAmountScale,
            priceDisplayDecimals: priceConverter(config).displayDecimals,
            quantityDisplayDecimals: config.baseAsset.quantityDisplayDecimals,
            quoteAmountDisplayDecimals: config.quoteAsset.quantityDisplayDecimals,
        };
    }

    validateSpotOrderDecimalInput(input: SpotOrderDecimalInput): CatalogValidationResult {
        const pair = this.market.requirePair(input.pair);
        const errors: CatalogValidationError[] = [];

        const quantityScaled = this.validateQuantity(pair, input.quantity, errors);
        const priceTicks =
            input.price === undefined ? null : this.validatePrice(pair, input.price, errors);

        if (quantityScaled !== null && priceTicks !== null) {
            this.validateMinNotional(pair, quantityScaled, priceTicks, errors);
        }

        return { valid: errors.length === 0, errors };
    }

    assertSpotOrderDecimalInput(input: SpotOrderDecimalInput): void {
        const result = this.validateSpotOrderDecimalInput(input);
        if (!result.valid) throw new CatalogValidationFailedError(result.errors);
    }

    private validateQuantity(
        pair: EnrichedPairConfig,
        quantity: string,
        errors: CatalogValidationError[],
    ): bigint | null {
        const scale = pair.baseAsset.quantityScale;
        const parsed = tryDecimalToScaled(quantity, scale);
        if (!parsed.ok) {
            errors.push({
                field: "quantity",
                rule: "parse",
                message: conversionFailureMessage("quantity", quantity, parsed.failure),
                actual: quantity,
            });
            return null;
        }

        if (parsed.scaled > PROTOBUF_INT64_MAX) {
            const maximum = scaledToDecimal(PROTOBUF_INT64_MAX, scale);
            errors.push({
                field: "quantity",
                rule: "maxQty",
                message: `quantity exceeds the wire-format maximum of ${maximum}`,
                expected: maximum,
                actual: quantity,
            });
            return null;
        }

        const step = this.requireConstraintScaled(pair.stepSize, scale, "stepSize");
        if (step > 0n && parsed.scaled % step !== 0n) {
            errors.push({
                field: "quantity",
                rule: "stepSize",
                message: `quantity must be a multiple of the pair step size ${pair.stepSize}`,
                expected: pair.stepSize,
                actual: quantity,
            });
        }

        const minQty = this.requireConstraintScaled(pair.minQtyBase, scale, "minQtyBase");
        if (parsed.scaled < minQty || parsed.scaled === 0n) {
            errors.push({
                field: "quantity",
                rule: "minQty",
                message: `quantity is below the pair minimum of ${pair.minQtyBase}`,
                expected: pair.minQtyBase,
                actual: quantity,
            });
        }

        return parsed.scaled;
    }

    private validatePrice(
        pair: EnrichedPairConfig,
        price: string,
        errors: CatalogValidationError[],
    ): bigint | null {
        const parsed = tryDecimalToScaled(price, PRICE_SCALE);
        if (!parsed.ok) {
            errors.push({
                field: "price",
                rule: "parse",
                message: conversionFailureMessage("price", price, parsed.failure),
                actual: price,
            });
            return null;
        }

        if (parsed.scaled > PROTOBUF_INT64_MAX) {
            const maximum = scaledToDecimal(PROTOBUF_INT64_MAX, PRICE_SCALE);
            errors.push({
                field: "price",
                rule: "maxPrice",
                message: `price exceeds the wire-format maximum of ${maximum}`,
                expected: maximum,
                actual: price,
            });
            return null;
        }

        const tick = this.requireConstraintScaled(pair.tickSize, PRICE_SCALE, "tickSize");
        if (tick > 0n && parsed.scaled % tick !== 0n) {
            errors.push({
                field: "price",
                rule: "tickSize",
                message: `price must be a multiple of the pair tick size ${pair.tickSize}`,
                expected: pair.tickSize,
                actual: price,
            });
        }

        return parsed.scaled;
    }

    private validateMinNotional(
        pair: EnrichedPairConfig,
        quantityScaled: bigint,
        priceTicks: bigint,
        errors: CatalogValidationError[],
    ): void {
        const notionalScale = pair.baseAsset.quantityScale + PRICE_SCALE;
        const minNotional = this.requireConstraintScaled(
            pair.minNotionalQuote,
            notionalScale,
            "minNotionalQuote",
        );
        const notional = quantityScaled * priceTicks;
        if (notional < minNotional) {
            errors.push({
                field: "notional",
                rule: "minNotional",
                message: `order notional is below the pair minimum of ${pair.minNotionalQuote}`,
                expected: pair.minNotionalQuote,
                actual: scaledToDecimal(notional, notionalScale),
            });
        }
    }

    /** Pair constraint strings come from the catalog itself, so failures are data bugs. */
    private requireConstraintScaled(decimal: string, scale: number, field: string): bigint {
        const result = tryDecimalToScaled(decimal, scale);
        if (!result.ok) {
            throw new CatalogConversionError(
                field,
                conversionFailureMessage(field, decimal, result.failure),
            );
        }
        return result.scaled;
    }
}

class ZipperReader implements ZipperCatalogReader {
    constructor(private readonly getSnapshot: SnapshotGetter) {}

    listChains(): readonly ZipperChainConfig[] {
        return this.getSnapshot().zipper.chains;
    }

    getChain(chain: ChainCatalogKey): ZipperChainConfig | null {
        const key = resolveChainKey(chain);
        return key.lookup === "chainCode"
            ? this.getChainByCode(key.value)
            : this.getChainById(key.value);
    }

    requireChain(chain: ChainCatalogKey): ZipperChainConfig {
        const key = resolveChainKey(chain);
        return requireFound("zipper", key.lookup, key.value, this.getChain(chain));
    }

    getChainByCode(chainCode: string): ZipperChainConfig | null {
        return indexesFor(this.getSnapshot()).zipperChainByCode.get(chainCode) ?? null;
    }

    requireChainByCode(chainCode: string): ZipperChainConfig {
        return requireFound("zipper", "chainCode", chainCode, this.getChainByCode(chainCode));
    }

    getChainById(chainId: number): ZipperChainConfig | null {
        return indexesFor(this.getSnapshot()).zipperChainById.get(chainId) ?? null;
    }

    requireChainById(chainId: number): ZipperChainConfig {
        return requireFound("zipper", "chainId", chainId, this.getChainById(chainId));
    }

    getChainIdByCode(chainCode: string): number | null {
        return this.getChainByCode(chainCode)?.chainId ?? null;
    }

    requireChainIdByCode(chainCode: string): number {
        return this.requireChainByCode(chainCode).chainId;
    }

    listAssets(): readonly ZipperEnrichedAssetConfig[] {
        return this.getSnapshot().zipper.assets;
    }

    getAsset(asset: AssetCatalogKey): ZipperEnrichedAssetConfig | null {
        const key = resolveAssetKey(asset);
        return key.lookup === "symbol"
            ? this.getAssetBySymbol(key.value)
            : this.getAssetByLedgerId(key.value);
    }

    requireAsset(asset: AssetCatalogKey): ZipperEnrichedAssetConfig {
        const key = resolveAssetKey(asset);
        return requireFound("zipper", key.lookup, key.value, this.getAsset(asset));
    }

    getAssetBySymbol(assetSymbol: string): ZipperEnrichedAssetConfig | null {
        return indexesFor(this.getSnapshot()).zipperAssetBySymbol.get(assetSymbol) ?? null;
    }

    requireAssetBySymbol(assetSymbol: string): ZipperEnrichedAssetConfig {
        return requireFound("zipper", "symbol", assetSymbol, this.getAssetBySymbol(assetSymbol));
    }

    getAssetByLedgerId(ledgerAssetId: number): ZipperEnrichedAssetConfig {
        return resolveZipperAssetByLedgerId(ledgerAssetId, (id) => this.lookupAssetByLedgerId(id));
    }

    lookupAssetByLedgerId(ledgerAssetId: number): ZipperEnrichedAssetConfig | null {
        return indexesFor(this.getSnapshot()).zipperAssetByLedgerId.get(ledgerAssetId) ?? null;
    }

    requireAssetByLedgerId(ledgerAssetId: number): ZipperEnrichedAssetConfig {
        return this.getAssetByLedgerId(ledgerAssetId);
    }

    getAssetByUAssetId(uAssetId: string): ZipperEnrichedAssetConfig | null {
        return indexesFor(this.getSnapshot()).zipperAssetByUAssetId.get(uAssetId) ?? null;
    }

    requireAssetByUAssetId(uAssetId: string): ZipperEnrichedAssetConfig {
        return requireFound("zipper", "uAssetId", uAssetId, this.getAssetByUAssetId(uAssetId));
    }

    getAssetChain(asset: AssetCatalogKey, chain: ChainCatalogKey): ZipperAssetChainRoute | null {
        const zipperAsset = this.getAsset(asset);
        const zipperChain = this.getChain(chain);
        if (!zipperAsset || !zipperChain) return null;
        const route = zipperAsset.chains.find(
            (candidate) => candidate.chainId === zipperChain.chainId,
        );
        return route ? { asset: zipperAsset, chain: route } : null;
    }

    requireAssetChain(asset: AssetCatalogKey, chain: ChainCatalogKey): ZipperAssetChainRoute {
        const route = this.getAssetChain(asset, chain);
        if (!route) {
            throw new CatalogLookupError(
                "zipper",
                "assetChain",
                `${formatKey(resolveAssetKey(asset))}:${formatKey(resolveChainKey(chain))}`,
            );
        }
        return route;
    }

    getAssetChainByZippedAssetId(zippedAssetId: number): ZipperAssetChainRoute | null {
        return indexesFor(this.getSnapshot()).zipperRouteByZippedAssetId.get(zippedAssetId) ?? null;
    }

    requireAssetChainByZippedAssetId(zippedAssetId: number): ZipperAssetChainRoute {
        return requireFound(
            "zipper",
            "zippedAssetId",
            zippedAssetId,
            this.getAssetChainByZippedAssetId(zippedAssetId),
        );
    }

    getZippedAssetId(asset: AssetCatalogKey, chain: ChainCatalogKey): number | null {
        return this.getAssetChain(asset, chain)?.chain.zippedAssetId ?? null;
    }

    requireZippedAssetId(asset: AssetCatalogKey, chain: ChainCatalogKey): number {
        return this.requireAssetChain(asset, chain).chain.zippedAssetId;
    }

    listContracts(): readonly ZipperChainContractConfig[] {
        return this.getSnapshot().zipper.contracts;
    }

    getContract(contractName: ZipperContractName): ZipperChainContractConfig | null {
        return this.getContractByName(contractName);
    }

    requireContract(contractName: ZipperContractName): ZipperChainContractConfig {
        return this.requireContractByName(contractName);
    }

    getContractByName(contractName: ZipperContractName): ZipperChainContractConfig | null {
        return indexesFor(this.getSnapshot()).zipperContractByName.get(contractName) ?? null;
    }

    requireContractByName(contractName: ZipperContractName): ZipperChainContractConfig {
        return requireFound(
            "zipper",
            "contractName",
            contractName,
            this.getContractByName(contractName),
        );
    }
}

function formatKey(key: { lookup: string; value: string | number }): string {
    return String(key.value);
}

class SnapshotCatalogReader implements CatalogReader {
    readonly market: MarketCatalogReader;
    readonly ledger: LedgerCatalogReader;
    readonly orders: OrdersCatalogReader;
    readonly zipper: ZipperCatalogReader;
    readonly snapshot: () => CatalogSnapshot;

    constructor(getSnapshot: SnapshotGetter) {
        const market = new MarketReader(getSnapshot);
        this.market = market;
        this.ledger = new LedgerReader(market);
        this.orders = new OrdersReader(market);
        this.zipper = new ZipperReader(getSnapshot);
        this.snapshot = () => getSnapshot();
    }
}

export function createReader(getSnapshot: () => CatalogSnapshot): CatalogReader {
    return new SnapshotCatalogReader(getSnapshot);
}

export function createCatalogSnapshotReader(snapshot: CatalogSnapshot): CatalogReader {
    const parsed = parseCatalogSnapshot(snapshot);
    return createReader(() => parsed);
}
