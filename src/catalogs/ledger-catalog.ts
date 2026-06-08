import { formatToDecimals } from "./orders-catalog.js";
import { getAssetByLedgerId } from "./market-data-catalog.js";

// Internal ledger scale (PolyesterChain): always 18 for on-chain assets
export const LEDGER_SCALE = 18;

export function isKnownAssetId(ledgerId: number): boolean {
    return ledgerId !== 0 && getAssetByLedgerId(ledgerId) !== undefined;
}

/**
 * Formats a full-scale ledger decimal string to an asset's display precision.
 */
export function formatLedgerDecimal(amount: string, displayDecimals: number): string {
    return formatToDecimals(amount, displayDecimals, LEDGER_SCALE);
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

/**
 * Returns the display name for a ledger account code.
 */
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

/**
 * Returns the display name for a ledger transfer type.
 */
export function transferTypeNameFor(code: number): TransferTypeName {
    return transferCodeNames[code] ?? `xfer_code:${code}`;
}
