import { formatToDecimals } from "./orders-catalog.js";

// Internal ledger scale (PolyesterChain): always 18 for on-chain assets
export const LEDGER_SCALE = 18;

/**
 * Formats a full-scale ledger decimal string to an asset's display precision.
 */
export function formatLedgerDecimal(amount: string, displayDecimals: number): string {
    return formatToDecimals(amount, displayDecimals, LEDGER_SCALE);
}
