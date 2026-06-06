import { formatAmountDisplay } from "../catalogs/ledger-catalog.js";
import { getAllPairs, getPairBySymbolId } from "./market-data-catalog.js";

/**
 * Returns symbol dropdown options from the current catalog.
 * Includes "All" option at the start.
 */
export function getSymbolOptions(): { label: string; value: string }[] {
    const options = [{ label: "All", value: "0" }];
    for (const pair of getAllPairs()) {
        options.push({ label: pair.symbol, value: String(pair.symbolId) });
    }
    return options;
}

// Convert integer in arbitrary-scale units to a decimal string (no scientific, trimmed)
export function intToDecimalString(x: bigint | number | string, scale: number): string {
    const s = String(x ?? "0").replace(/[^0-9-]/g, "");
    if (!s) return "0";
    const neg = s.startsWith("-");
    const v = neg ? s.slice(1) : s;
    const d = Math.max(0, Math.trunc(scale));
    const pad = v.padStart(d + 1, "0");
    const head = pad.slice(0, pad.length - d);
    const tail = pad.slice(pad.length - d);
    const raw = head + (d ? "." + tail : "");
    const trimmed = raw.replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/, "");
    return (neg ? "-" : "") + trimmed;
}

// Convert integer in 18-scale units to a decimal string (no scientific, trimmed)
export function int18ToDecimalString(x: bigint | number | string): string {
    return intToDecimalString(x, 18);
}

const DEFAULT_QTY_DECIMALS = 8;
const DEFAULT_QTY_SCALE = 18;

// Format order quantity (scaled integer) using the pair's base asset display decimals
export function formatQtyForSymbol(qty: bigint | number | string, symbolId: number): string {
    const pair = getPairBySymbolId(symbolId);
    const scale = pair?.baseAsset.quantityScale ?? DEFAULT_QTY_SCALE;
    const decimals = pair?.baseAsset.quantityDisplayDecimals ?? DEFAULT_QTY_DECIMALS;
    const decStr = intToDecimalString(qty ?? 0, scale);
    return formatToDecimals(decStr, decimals, scale);
}

// Format a decimal string to a specific number of decimals with half-up rounding
function formatToDecimals(amount: string, decimals: number, scale: number): string {
    const s = (amount ?? "").trim();
    if (!s) return "0";

    const SCALE = Math.max(0, Math.trunc(scale));
    if (decimals >= SCALE) return trimTrailingZeros(s);

    const parts = s.split(".");
    const intPart = (parts[0] ?? "").replace(/[^0-9]/g, "") || "0";
    let frac = (parts[1] ?? "").replace(/[^0-9]/g, "");
    if (frac.length < SCALE) frac = frac + "0".repeat(SCALE - frac.length);
    else if (frac.length > SCALE) frac = frac.slice(0, SCALE);

    const full = intPart + frac;
    const drop = SCALE - decimals;
    const pow = "1" + "0".repeat(drop);
    const n = BigInt(full);
    const add = drop > 0 ? BigInt("5" + "0".repeat(drop - 1)) : 0n;
    const denom = BigInt(pow);
    const q = (n + add) / denom;

    const qStr = q.toString();
    if (decimals === 0) return qStr;

    const len = qStr.length;
    if (len <= decimals) {
        const frac = qStr.padStart(decimals, "0");
        return trimTrailingZeros("0." + frac);
    }

    const split = len - decimals;
    const head = qStr.slice(0, split);
    const tailRaw = qStr.slice(split).padStart(decimals, "0");
    return trimTrailingZeros(head + "." + tailRaw);
}

function trimTrailingZeros(x: string): string {
    if (!x.includes(".")) return x;
    let y = x.replace(/\.0+$/, "");
    if (y.indexOf(".") >= 0) {
        y = y.replace(/(\.\d*?)0+$/u, "$1");
        if (y.endsWith(".")) y = y.slice(0, -1);
    }
    return y;
}

// Format a trade fee given scaled integer amount, symbolId, and FeeSource enum value.
// QUOTE fees are formatted in quote asset units; RECEIVED fees in base asset units.
export function formatFeeForTrade(
    feeScaled: bigint | number | string,
    symbolId: number,
    feeSourceNum: number,
): string {
    const pair = getPairBySymbolId(symbolId);
    // 1=QUOTE, 2=RECEIVED (base)
    const asset = feeSourceNum === 1 ? pair?.quoteAsset : pair?.baseAsset;
    const scale = asset?.quantityScale ?? DEFAULT_QTY_SCALE;
    const decStr = intToDecimalString(feeScaled ?? 0, scale);
    const assetId = asset?.ledgerId ?? (feeSourceNum === 1 ? 1 : 3);
    return formatAmountDisplay(decStr, assetId);
}

// Convert integer in 6-scale ticks to decimal string (prices)
export function int6ToDecimalString(x: bigint | number | string): string {
    const s = String(x ?? "0").replace(/[^0-9-]/g, "");
    if (!s) return "0";
    const neg = s.startsWith("-");
    const v = neg ? s.slice(1) : s;
    const d = 6;
    const pad = v.padStart(d + 1, "0");
    const head = pad.slice(0, pad.length - d);
    const tail = pad.slice(pad.length - d);
    const raw = head + (d ? "." + tail : "");
    const trimmed = raw.replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/, "");
    return (neg ? "-" : "") + trimmed;
}

// Format price ticks for a symbol (assume 6-decimal ticks universally for now)
export function formatPriceForSymbol(
    priceTicks: bigint | number | string,
    _symbolId: number,
): string {
    return int6ToDecimalString(priceTicks ?? 0);
}

export type Side = "buy" | "sell";

const SIDE_LABEL_MAP: Record<number, Side> = {
    1: "buy",
    2: "sell",
};
export function sideLabelFor(v: number): Side {
    const value = SIDE_LABEL_MAP[v];
    if (!value) throw new Error(`Invalid side: ${v}`);
    return value;
}

export type OrderStatus =
    | "pending"
    | "pending_cancel"
    | "working"
    | "filled"
    | "canceled"
    | "rejected"
    | "partial";

const ORDER_STATUS_LABEL_MAP: Record<number, OrderStatus> = {
    1: "pending",
    2: "pending_cancel",
    3: "working",
    4: "filled",
    5: "canceled",
    6: "rejected",
};

export function orderStatusLabelFor(v: number): OrderStatus {
    const value = ORDER_STATUS_LABEL_MAP[v];
    if (!value) throw new Error(`Invalid order status: ${v}`);
    return value;
}

export type OrderType = "limit" | "market";
const ORDER_TYPE_LABEL_MAP: Record<number, OrderType> = {
    1: "limit",
    2: "market",
};
export function orderTypeLabelFor(v: number): OrderType {
    const value = ORDER_TYPE_LABEL_MAP[v];
    if (!value) throw new Error(`Invalid order type: ${v}`);
    return value;
}

export type TIF = "GTC" | "IOC" | "FOK";
const TIF_LABEL_MAP: Record<number, TIF> = {
    1: "GTC",
    2: "IOC",
    3: "FOK",
};
export function tifLabelFor(v: number): TIF {
    const value = TIF_LABEL_MAP[v];
    if (!value) throw new Error(`Invalid TIF: ${v}`);
    return value;
}

export type STPMode = "expire_maker" | "expire_taker" | "expire_both";
const STP_MODE_LABEL_MAP: Record<number, STPMode> = {
    1: "expire_maker",
    2: "expire_taker",
    3: "expire_both",
};
export function stpModeLabelFor(v: number): STPMode {
    const value = STP_MODE_LABEL_MAP[v];
    if (!value) throw new Error(`Invalid STP mode: ${v}`);
    return value;
}

export type FeeSource = "quote" | "received";
const FEE_SOURCE_LABEL_MAP: Record<number, FeeSource> = {
    1: "quote",
    2: "received",
};
export function feeSourceLabelFor(v: number): FeeSource {
    const value = FEE_SOURCE_LABEL_MAP[v];
    if (!value) throw new Error(`Invalid fee source: ${v}`);
    return value;
}

export type Liquidity = "maker" | "taker";
