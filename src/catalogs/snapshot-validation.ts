import { ValidationError } from "../shared/errors.js";
import type { CatalogSnapshot } from "./types.js";
import type { ZippedAssetSupplyCatalogUpdate } from "./zipper-supply.js";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
    return typeof record[key] === "string";
}

function hasNumber(record: Record<string, unknown>, key: string): boolean {
    return isFiniteNumber(record[key]);
}

function isMarketAsset(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
        hasString(value, "symbol") &&
        hasNumber(value, "ledgerId") &&
        hasString(value, "name") &&
        hasNumber(value, "quantityDisplayDecimals") &&
        hasNumber(value, "quantityScale")
    );
}

function isMarketPair(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
        hasNumber(value, "symbolId") &&
        hasString(value, "symbol") &&
        isMarketAsset(value.baseAsset) &&
        isMarketAsset(value.quoteAsset) &&
        hasString(value, "tickSize") &&
        hasString(value, "stepSize") &&
        hasString(value, "minNotionalQuote") &&
        hasString(value, "minQtyBase") &&
        typeof value.allowBuyFeeFromBase === "boolean" &&
        hasNumber(value, "defaultMarketSlippagePctBuy") &&
        hasNumber(value, "defaultMarketSlippagePctSell") &&
        hasNumber(value, "maxClientRefDriftPct") &&
        hasString(value, "status")
    );
}

function isZipperChain(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) return false;
    return (
        hasNumber(value, "chainId") &&
        hasString(value, "code") &&
        hasString(value, "name") &&
        hasString(value, "nativeChainId") &&
        hasString(value, "nativeCurrencySymbol") &&
        hasString(value, "explorerUrl") &&
        hasString(value, "icon") &&
        hasNumber(value, "requiredConfirmations") &&
        hasNumber(value, "confirmationTimeSeconds") &&
        typeof value.isCaseSensitive === "boolean" &&
        hasNumber(value, "minAddressLength") &&
        hasNumber(value, "maxAddressLength")
    );
}

function isToken(value: unknown): boolean {
    return isRecord(value) && hasString(value, "address") && hasNumber(value, "decimals");
}

function isZipperAssetChain(value: unknown): boolean {
    return (
        isZipperChain(value) &&
        hasNumber(value, "zippedAssetId") &&
        typeof value.isNativeAsset === "boolean" &&
        (value.supply === undefined || typeof value.supply === "string") &&
        isToken(value.sourceToken) &&
        isToken(value.zToken)
    );
}

function isZipperAsset(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
        hasString(value, "asset") &&
        hasNumber(value, "ledgerId") &&
        hasString(value, "name") &&
        hasString(value, "icon") &&
        hasNumber(value, "quantityScale") &&
        hasNumber(value, "quantityDisplayDecimals") &&
        hasString(value, "uAssetId") &&
        Array.isArray(value.chains) &&
        value.chains.every(isZipperAssetChain)
    );
}

function isZipperContract(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
        hasString(value, "name") &&
        hasString(value, "address") &&
        hasString(value, "type") &&
        hasString(value, "description") &&
        hasNumber(value, "version")
    );
}

function isCatalogSnapshot(value: unknown): value is CatalogSnapshot {
    if (!isRecord(value)) return false;
    if (value.source !== "api" && value.source !== "snapshot") return false;
    if (!hasNumber(value, "tsMs") || !hasNumber(value, "version")) return false;

    const market = value.market;
    const zipper = value.zipper;
    return (
        isRecord(market) &&
        Array.isArray(market.assets) &&
        market.assets.every(isMarketAsset) &&
        Array.isArray(market.pairs) &&
        market.pairs.every(isMarketPair) &&
        isRecord(zipper) &&
        Array.isArray(zipper.chains) &&
        zipper.chains.every(isZipperChain) &&
        Array.isArray(zipper.assets) &&
        zipper.assets.every(isZipperAsset) &&
        Array.isArray(zipper.contracts) &&
        zipper.contracts.every(isZipperContract)
    );
}

/** Parses untrusted SSR or JavaScript input as a catalog snapshot. */
export function parseCatalogSnapshot(value: unknown): CatalogSnapshot {
    if (!isCatalogSnapshot(value)) {
        throw new ValidationError("Catalog snapshot is malformed.");
    }
    return value;
}

/** Parses supply updates before they can advance a snapshot's version or timestamp. */
export function parseZippedAssetSupplyCatalogUpdates(
    value: unknown,
): readonly ZippedAssetSupplyCatalogUpdate[] {
    if (
        !Array.isArray(value) ||
        !value.every(
            (update): update is ZippedAssetSupplyCatalogUpdate =>
                isRecord(update) &&
                Number.isInteger(update.zippedAssetId) &&
                typeof update.supply === "string",
        )
    ) {
        throw new ValidationError("Zipper catalog supply updates are malformed.");
    }
    return value;
}
