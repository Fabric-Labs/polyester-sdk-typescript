import type { AssetConfig } from "../services/market-data/market-data.schemas.js";
import { getAsset, getAssetByLedgerId, getAllAssets } from "./market-data-catalog.js";

const DEFAULT_DECIMALS = 8;
const DEFAULT_QUANTITY_SCALE = 18;

export function isKnownAssetId(ledgerId: number): boolean {
    return ledgerId !== 0 && getAssetByLedgerId(ledgerId) !== undefined;
}

export function assetForId(ledgerId: number): AssetConfig {
    const config = getAssetByLedgerId(ledgerId);
    if (config) return config;
    return {
        symbol: String(ledgerId),
        ledgerId,
        name: `Asset ${ledgerId}`,
        quantityDisplayDecimals: DEFAULT_DECIMALS,
        quantityScale: DEFAULT_QUANTITY_SCALE,
    };
}

export function assetForSymbol(symbol: string): AssetConfig {
    const config = getAsset(symbol);
    if (config) return config;
    return {
        symbol,
        ledgerId: 0,
        name: symbol,
        quantityDisplayDecimals: DEFAULT_DECIMALS,
        quantityScale: DEFAULT_QUANTITY_SCALE,
    };
}

export function symbolForAssetId(ledgerId: number): string {
    return assetForId(ledgerId).symbol;
}

/**
 * Returns ledger dropdown options from the current catalog.
 * Includes "All" option at the start.
 */
export function getLedgerOptions(): { label: string; value: string }[] {
    const options = [{ label: "All", value: "0" }];
    for (const asset of getAllAssets()) {
        options.push({ label: asset.symbol, value: String(asset.ledgerId) });
    }
    return options;
}

// Internal ledger scale (PolyesterChain): always 18 for on-chain assets
export const LEDGER_SCALE = 18;

function displayDecimalsFor(id: number): number {
    return assetForId(id).quantityDisplayDecimals ?? 8;
}

// Format a full-scale (18) decimal string to asset display decimals with half-up rounding, trim trailing zeros.
export function formatAmountDisplay(amount: string, assetId: number): string {
    const s = (amount ?? "").trim();
    if (!s) return "0";
    const d = displayDecimalsFor(assetId);
    if (d >= LEDGER_SCALE) {
        return trimZeros(s);
    }
    // Normalize to integer at 18 scale
    const parts = s.split(".");
    const intPart = (parts[0] ?? "").replace(/[^0-9]/g, "") || "0";
    let frac = (parts[1] ?? "").replace(/[^0-9]/g, "");
    if (frac.length < LEDGER_SCALE) frac = frac + "0".repeat(LEDGER_SCALE - frac.length);
    else if (frac.length > LEDGER_SCALE) frac = frac.slice(0, LEDGER_SCALE);
    const full = intPart + frac; // integer in 18-scale units
    // Half-up rounding to d decimals -> divide by 10^(18-d)
    const drop = LEDGER_SCALE - d;
    const pow = "1" + "0".repeat(drop);
    // rounded = (N + 5*10^(drop-1)) / 10^drop
    const n = BigInt(full);
    const add = drop > 0 ? BigInt("5" + "0".repeat(drop - 1)) : 0n;
    const denom = BigInt(pow);
    const q = (n + add) / denom;
    // Render with d decimals
    const qStr = q.toString();
    if (d === 0) return qStr;
    const len = qStr.length;
    if (len <= d) {
        // Value < 1: prefix with 0 and pad fractional to d digits
        const frac = qStr.padStart(d, "0");
        return trimZeros("0." + frac);
    }
    const split = len - d;
    const head = qStr.slice(0, split);
    const tailRaw = qStr.slice(split).padStart(d, "0");
    return trimZeros(head + "." + tailRaw);
}

function trimZeros(x: string): string {
    if (!x.includes(".")) return x;
    let y = x.replace(/\.0+$/, "");
    if (y.indexOf(".") >= 0) {
        y = y.replace(/(\.\d*?)0+$/u, "$1");
        if (y.endsWith(".")) y = y.slice(0, -1);
    }
    return y;
}

export type AccountCodeName =
    | "operator_assets"
    | "operator_liabilities"
    | "funding"
    | "unified_trading"
    | "fees_spot"
    | "fees_perp"
    | "clearing"
    | "insurance"
    | `acct_code:${number}`;

const accountCodeNames: Record<number, AccountCodeName> = {
    100: "operator_assets",
    200: "operator_liabilities",
    300: "funding",
    301: "unified_trading",
    400: "fees_spot",
    401: "fees_perp",
    402: "clearing",
    500: "insurance",
};

export function accountCodeNameFor(code: number): AccountCodeName {
    return accountCodeNames[code] ?? `acct_code:${code}`;
}

export type TransferTypeName =
    | "deposit"
    | "withdraw"
    | "maker_fee"
    | "taker_fee"
    | "funding"
    | "internal_transfer"
    | "trade_base"
    | "trade_quote"
    | "pnl"
    | "rebate"
    | "referral_share"
    | "liquidation"
    | "interest_accrual"
    | "borrow"
    | "repay"
    | "fund_to_unified"
    | "unified_to_fund"
    | `xfer_code:${number}`;

const transferCodeNames: Record<number, TransferTypeName> = {
    1000: "deposit",
    1001: "withdraw",
    1010: "maker_fee",
    1011: "taker_fee",
    1020: "funding",
    1030: "internal_transfer",
    1031: "trade_base",
    1032: "trade_quote",
    1040: "pnl",
    1041: "rebate",
    1043: "referral_share",
    1042: "liquidation",
    1050: "interest_accrual",
    1051: "borrow",
    1052: "repay",
    1060: "fund_to_unified",
    1061: "unified_to_fund",
};

export function transferTypeNameFor(code: number): TransferTypeName {
    return transferCodeNames[code] ?? `xfer_code:${code}`;
}
