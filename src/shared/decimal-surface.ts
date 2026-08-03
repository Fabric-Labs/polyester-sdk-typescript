/**
 * Internal scaled⇄decimal bridge for the SDK's public decimal-string surface.
 *
 * The wire protocol carries scaled integers (price ticks, per-asset scaled
 * quantities); the public SDK surface carries plain decimal strings. Output
 * schemas convert exactly (no rounding, trailing zeros trimmed); input schemas
 * convert strictly — excess precision is an error, never rounded away. Scaled
 * integers must not escape through any service input or output.
 */
import {
    scaledToDecimal,
    tryDecimalToScaled,
    type DecimalToScaledFailure,
} from "../catalogs/decimal.js";
import {
    CatalogConversionError,
    type ClientCatalog,
    type PairCatalogKey,
} from "../catalogs/types.js";
import { PRICE_SCALE } from "../catalogs/readers.js";

/** On-chain unified-asset amounts (`amountE18`) are always 18-decimal scaled. */
export const E18_SCALE = 18;

/**
 * Resolves wire scales for the SDK's internal decimal conversion. Backed by
 * the client catalog; `ready()` must be awaited before the synchronous lookups
 * are used so the catalog can answer them.
 */
export interface SdkScales {
    ready(): Promise<void>;
    price(): number;
    baseQty(pair: PairCatalogKey): number;
    quoteAmount(pair: PairCatalogKey): number;
    ledgerAmount(ledgerAssetId: number): number;
    zippedAssetAmount(zippedAssetId: number): number;
}

/**
 * Catalog-backed scale resolver. Takes a getter so it can be constructed
 * before the owning client has assigned its catalog.
 */
export function createCatalogSdkScales(getCatalog: () => ClientCatalog): SdkScales {
    return {
        ready: async () => {
            await getCatalog().ensureReady();
        },
        price: () => PRICE_SCALE,
        baseQty: (pair) => requirePair(getCatalog(), pair).baseAsset.quantityScale,
        quoteAmount: (pair) => requirePair(getCatalog(), pair).quoteAsset.quantityScale,
        ledgerAmount: (ledgerAssetId) =>
            getCatalog().ledger.requireAssetByLedgerId(ledgerAssetId).quantityScale,
        zippedAssetAmount: (zippedAssetId) =>
            getCatalog().zipper.requireAssetChainByZippedAssetId(zippedAssetId).asset.quantityScale,
    };
}

function requirePair(catalog: ClientCatalog, pair: PairCatalogKey) {
    return typeof pair === "string" || (typeof pair === "object" && "symbol" in pair)
        ? catalog.market.requirePairBySymbol(typeof pair === "string" ? pair : pair.symbol)
        : catalog.market.requirePairBySymbolId(typeof pair === "number" ? pair : pair.symbolId);
}

/** Output direction: exact scaled→decimal conversion (`1500000n`@6 → `"1.5"`). */
export function scaledToDecimalOutput(value: bigint, scale: number): string {
    return scaledToDecimal(value, scale);
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

/**
 * Input direction: strict decimal→scaled conversion. Throws
 * CatalogConversionError for non-decimal input or excess precision.
 */
export function decimalInputToScaled(field: string, value: string, scale: number): bigint {
    const result = tryDecimalToScaled(value.trim(), scale);
    if (!result.ok) {
        throw new CatalogConversionError(
            field,
            conversionFailureMessage(field, value, result.failure),
        );
    }
    return result.scaled;
}

/** Like decimalInputToScaled, but additionally requires a value greater than zero. */
export function positiveDecimalInputToScaled(field: string, value: string, scale: number): bigint {
    const scaled = decimalInputToScaled(field, value, scale);
    if (scaled <= 0n) {
        throw new CatalogConversionError(field, `${field} must be greater than 0: ${value}`);
    }
    return scaled;
}

/**
 * Decimal quantity → PolyesterChain E18 ledger units.
 * Input precision is capped at the asset's quantityScale; the wire value is
 * always upscaled to E18 (trading balances / amount_e18 convention).
 */
export function quantityInputToE18(params: {
    scales: SdkScales;
    assetId: number;
    quantity: string;
    field?: string;
}): bigint {
    const field = params.field ?? "quantity";
    const assetScale = params.scales.ledgerAmount(params.assetId);
    if (assetScale > E18_SCALE) {
        throw new CatalogConversionError(
            field,
            `${field} asset quantityScale ${assetScale} exceeds E18 ledger scale`,
        );
    }
    return (
        positiveDecimalInputToScaled(field, params.quantity, assetScale) *
        10n ** BigInt(E18_SCALE - assetScale)
    );
}

export interface ReadyGate {
    run(deliver: () => void): void;
}

/**
 * Orders event delivery behind catalog readiness. Events arriving before the
 * catalog can resolve scales are queued and flushed in arrival order once it
 * is ready; delivery errors (including post-flush ones) route to `onError`
 * instead of escaping into the transport, mirroring the realtime client's
 * consumer-handler isolation. If readiness itself fails, queued events are
 * dropped after `onError` fires — the stream cannot be decoded without scales.
 */
export function createReadyGate(
    ready: () => Promise<void>,
    onError?: (error: unknown) => void,
): ReadyGate {
    let state: "pending" | "open" | "failed" = "pending";
    const queue: Array<() => void> = [];

    const deliverIsolated = (deliver: () => void) => {
        try {
            deliver();
        } catch (error) {
            onError?.(error);
        }
    };

    ready().then(
        () => {
            state = "open";
            for (const deliver of queue.splice(0)) deliverIsolated(deliver);
        },
        (error) => {
            state = "failed";
            queue.length = 0;
            onError?.(error);
        },
    );

    return {
        run(deliver) {
            if (state === "open") deliverIsolated(deliver);
            else if (state === "pending") queue.push(deliver);
        },
    };
}
