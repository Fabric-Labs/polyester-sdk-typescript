/**
 * Internal scaled⇄decimal bridge for the SDK's public decimal-string surface.
 *
 * The wire protocol carries scaled integers (price ticks, per-asset scaled
 * quantities); the public SDK surface carries plain decimal strings. Output
 * schemas convert exactly (no rounding, trailing zeros trimmed); input schemas
 * accept zero padding but reject fractional precision that remains above the
 * scale after trailing zeros are removed. Scaled integers must not escape
 * through any service input or output.
 */
import {
    scaledToDecimal,
    tryDecimalToScaled,
    type DecimalToScaledFailure,
} from "../catalogs/decimal.js";
import {
    CatalogConversionError,
    CatalogLookupError,
    CatalogNotReadyError,
    type ClientCatalog,
    type PairCatalogKey,
} from "../catalogs/types.js";
import { PRICE_SCALE } from "../catalogs/readers.js";
import { PROTOBUF_INT64_MAX } from "./wire-bounds.js";
import {
    publicationHandlerErrorContext,
    type SdkSubscriptionErrorContext,
} from "./subscription-errors.js";
import { U128_MAX } from "../utils/u128.js";

/** On-chain unified-asset amounts (`amountE18`) are always 18-decimal scaled. */
export const E18_SCALE = 18;

/**
 * Policy notional caps (`max_order_notional`) are canonical quote microunits:
 * one unit is 0.000001 USDT, per the `auth.v1` policy contract. Fixed by the
 * protocol rather than per-pair, so it needs no catalog lookup.
 */
export const QUOTE_NOTIONAL_SCALE = 6;

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
    /** Base volume in public candles and market overview; falls back to the base quantity scale. */
    marketDataVolume(pair: PairCatalogKey): number;
    /** Composite reference candle prices; falls back to the primary price scale. */
    referencePrice(pair: PairCatalogKey): number;
    ledgerAmount(ledgerAssetId: number): number;
    zippedAssetAmount(zippedAssetId: number): number;
    /**
     * Refreshes the catalog after a lookup miss, so a pair listed after startup resolves.
     * Misses within {@link CATALOG_MISS_REFRESH_INTERVAL_MS} share one refresh; never rejects.
     */
    refreshAfterMiss?(): Promise<void>;
}

/** Least time between catalog refreshes that lookup misses start. */
export const CATALOG_MISS_REFRESH_INTERVAL_MS = 30_000;

/** Longest a lookup miss waits for its catalog refresh before it fails with the current catalog. */
export const CATALOG_MISS_REFRESH_TIMEOUT_MS = 10_000;

/** Runs `read`; on a catalog miss, refreshes the catalog and runs it once more, so a second miss throws. */
export async function withCatalogRefresh<T>(scales: SdkScales, read: () => T): Promise<T> {
    try {
        return read();
    } catch (error) {
        if (!(error instanceof CatalogLookupError) || !scales.refreshAfterMiss) throw error;
        await scales.refreshAfterMiss();
        return read();
    }
}

/** True when the catalog can scale quantities of `symbolId`. */
export function hasKnownSymbol(scales: SdkScales, symbolId: number): boolean {
    try {
        scales.baseQty(symbolId);
        return true;
    } catch {
        return false;
    }
}

/**
 * Keeps a stream's publications in order across catalog refreshes. Call the returned function
 * with each publication's handler: one naming a symbol the catalog lacks waits for a refresh,
 * and every later one waits behind it. A symbol still missing then fails in the handler, which
 * reports it to `onError`; nothing runs after the subscription closed.
 */
export function createCatalogRefreshQueue(
    scales: SdkScales,
    channel: string,
    onError: ((error: SdkSubscriptionErrorContext) => void) | undefined,
    isOpen: () => boolean,
): (missesCatalog: boolean, handle: () => void) => void {
    let tail: Promise<void> | undefined;
    return (missesCatalog, handle) => {
        const wait = tail ?? (missesCatalog ? scales.refreshAfterMiss?.() : undefined);
        if (!wait) return handle();
        const next = wait.then(() => {
            if (!isOpen()) return;
            try {
                handle();
            } catch (error) {
                try {
                    onError?.(publicationHandlerErrorContext(channel, error));
                } catch {
                    // The caller's onError threw; keep later publications flowing.
                }
            }
        });
        tail = next;
        void next.then(() => {
            if (tail === next) tail = undefined;
        });
    };
}

/**
 * Catalog-backed scale resolver. Takes a getter so it can be constructed
 * before the owning client has assigned its catalog.
 */
export function createCatalogSdkScales(getCatalog: () => ClientCatalog): SdkScales {
    let lastMissRefresh: { at: number; done: Promise<void> } | undefined;
    return {
        refreshAfterMiss: () => {
            if (
                lastMissRefresh &&
                Date.now() - lastMissRefresh.at < CATALOG_MISS_REFRESH_INTERVAL_MS
            ) {
                return lastMissRefresh.done;
            }
            // A failed or stalled refresh leaves the catalog as it was, so the retried lookup
            // misses again instead of holding a stream behind it.
            let timer: ReturnType<typeof setTimeout> | undefined;
            const done = Promise.race([
                getCatalog().refresh(),
                new Promise<void>((resolve) => {
                    timer = setTimeout(resolve, CATALOG_MISS_REFRESH_TIMEOUT_MS);
                }),
            ]).then(
                () => clearTimeout(timer),
                () => clearTimeout(timer),
            );
            lastMissRefresh = { at: Date.now(), done };
            return done;
        },
        ready: async () => {
            await getCatalog().ensureReady();
        },
        price: () => PRICE_SCALE,
        baseQty: (pair) => requirePair(getCatalog(), pair).baseAsset.quantityScale,
        quoteAmount: (pair) => requirePair(getCatalog(), pair).quoteAsset.quantityScale,
        marketDataVolume: (pair) => {
            const { baseAsset } = requirePair(getCatalog(), pair);
            return baseAsset.marketDataVolumeScale ?? baseAsset.quantityScale;
        },
        referencePrice: (pair) =>
            requirePair(getCatalog(), pair).referencePriceScale ?? PRICE_SCALE,
        ledgerAmount: (ledgerAssetId) => {
            const ledger = getCatalog().ledger;
            if (!ledger.isKnownAssetId(ledgerAssetId)) {
                throw new CatalogLookupError("ledger", "ledgerId", ledgerAssetId);
            }
            return ledger.requireAssetByLedgerId(ledgerAssetId).quantityScale;
        },
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
 * CatalogConversionError for non-decimal input or inexact excess precision.
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

function unboundedPositiveDecimalInputToScaled(
    field: string,
    value: string,
    scale: number,
): bigint {
    const scaled = decimalInputToScaled(field, value, scale);
    if (scaled <= 0n) {
        throw new CatalogConversionError(field, `${field} must be greater than 0: ${value}`);
    }
    return scaled;
}

/**
 * Converts a positive decimal input to a scaled protobuf `int64` value.
 * Rejects values above the wire-format ceiling before serialization.
 */
export function positiveDecimalInputToScaled(field: string, value: string, scale: number): bigint {
    const scaled = unboundedPositiveDecimalInputToScaled(field, value, scale);
    if (scaled > PROTOBUF_INT64_MAX) {
        throw new CatalogConversionError(
            field,
            `${field} exceeds the maximum supported value: ${value}`,
        );
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
    const scaled =
        unboundedPositiveDecimalInputToScaled(field, params.quantity, assetScale) *
        10n ** BigInt(E18_SCALE - assetScale);
    if (scaled > U128_MAX) {
        throw new CatalogConversionError(
            field,
            `${field} exceeds the maximum supported value: ${params.quantity}`,
        );
    }
    return scaled;
}

/**
 * Positive decimal → 18-decimal U128 units, for amounts the wire takes at full
 * E18 precision whatever the asset's quantity scale.
 */
export function positiveE18InputToScaled(field: string, value: string): bigint {
    const scaled = unboundedPositiveDecimalInputToScaled(field, value, E18_SCALE);
    if (scaled > U128_MAX) {
        throw new CatalogConversionError(
            field,
            `${field} exceeds the maximum supported value: ${value}`,
        );
    }
    return scaled;
}

export interface ReadyGate {
    /** Queues or delivers one transition while the gate remains active. */
    run(deliver: () => void): void;
    /** Drops pending transitions and permanently prevents future delivery. */
    close(): void;
}

interface ReadyGateHandlers {
    onDeliveryError?: (error: unknown) => void;
    onTerminalError: (error: unknown) => void;
}

const READY_GATE_MAX_PENDING_DELIVERIES = 1_024;

/**
 * Transition event delivery behind catalog readiness. Events arriving before the
 * catalog can resolve scales are queued and flushed in arrival order once it
 * is ready. Delivery errors are isolated from the transport. Readiness failure
 * or queue overflow is terminal because dropping an event would break stream
 * continuity; the owning subscription must visibly terminate when notified.
 */
export function createReadyGate(
    ready: () => Promise<void>,
    handlers: ReadyGateHandlers,
): ReadyGate {
    let state: "pending" | "open" | "closed" = "pending";
    const queue: Array<() => void> = [];

    const deliverIsolated = (deliver: () => void) => {
        try {
            deliver();
        } catch (error) {
            handlers.onDeliveryError?.(error);
        }
    };

    const closeWithError = (error: unknown) => {
        if (state === "closed") return;
        state = "closed";
        queue.length = 0;
        handlers.onTerminalError(error);
    };

    Promise.resolve()
        .then(ready)
        .then(
            () => {
                if (state !== "pending") return;
                state = "open";
                for (const deliver of queue.splice(0)) deliverIsolated(deliver);
            },
            (error) => {
                if (state !== "pending") return;
                closeWithError(error);
            },
        );

    return {
        run(deliver) {
            if (state === "open") deliverIsolated(deliver);
            else if (state === "pending") {
                if (queue.length === READY_GATE_MAX_PENDING_DELIVERIES) {
                    closeWithError(new CatalogNotReadyError());
                    return;
                }
                queue.push(deliver);
            }
        },
        close() {
            if (state === "closed") return;
            state = "closed";
            queue.length = 0;
        },
    };
}
