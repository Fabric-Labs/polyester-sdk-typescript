import type { LedgerBalance } from "./balances.schemas.js";
import { compareUnsignedIntegerStrings } from "../../shared/reconciliation.js";

/**
 * Reconciles the atomically versioned trading tuple independently from funding.
 */
export function mergeLedgerBalances(
    existing: LedgerBalance | undefined,
    incoming: LedgerBalance,
): LedgerBalance {
    if (!existing) return incoming;
    if (existing.assetId !== incoming.assetId) {
        throw new RangeError(
            `Cannot merge ledger balances for different assets (${existing.assetId} and ${incoming.assetId})`,
        );
    }

    const hasRevisions = [
        incoming.tradingRevision,
        incoming.fundingRevision,
        existing.tradingRevision,
        existing.fundingRevision,
    ].some((revision) => compareUnsignedIntegerStrings(revision, "0") > 0);
    if (!hasRevisions) return incoming;

    const tradingIsNewer =
        compareUnsignedIntegerStrings(incoming.tradingRevision, existing.tradingRevision) > 0;
    const fundingIsNewer =
        compareUnsignedIntegerStrings(incoming.fundingRevision, existing.fundingRevision) > 0;

    if (!tradingIsNewer && !fundingIsNewer) return existing;

    return {
        assetId: existing.assetId,
        trading: tradingIsNewer ? incoming.trading : existing.trading,
        funding: fundingIsNewer ? incoming.funding : existing.funding,
        reserved: tradingIsNewer ? incoming.reserved : existing.reserved,
        available: tradingIsNewer ? incoming.available : existing.available,
        tradingRevision: tradingIsNewer ? incoming.tradingRevision : existing.tradingRevision,
        fundingRevision: fundingIsNewer ? incoming.fundingRevision : existing.fundingRevision,
    };
}
