import type { AssetConfig } from "../shared/catalog-config.js";
import type { ZipperEnrichedAssetConfig } from "./zipper-catalog.js";

export const UNKNOWN_ASSET_LABEL = "Unknown asset";
export const UNKNOWN_LEDGER_ASSET_ID = 9999;

// Scale 0 keeps an unknown asset's amounts unscaled instead of inventing a scale.
export const unknownLedgerAsset = Object.freeze({
    symbol: UNKNOWN_ASSET_LABEL,
    ledgerId: UNKNOWN_LEDGER_ASSET_ID,
    name: UNKNOWN_ASSET_LABEL,
    quantityDisplayDecimals: 0,
    quantityScale: 0,
} satisfies AssetConfig);

export const unknownZipperAsset = Object.freeze({
    asset: UNKNOWN_ASSET_LABEL,
    ledgerId: UNKNOWN_LEDGER_ASSET_ID,
    name: UNKNOWN_ASSET_LABEL,
    icon: "",
    quantityScale: 0,
    quantityDisplayDecimals: 0,
    uAssetId: "",
    chains: [],
} satisfies ZipperEnrichedAssetConfig);

export function isUnknownLedgerAsset(asset: AssetConfig): boolean {
    return asset.ledgerId === UNKNOWN_LEDGER_ASSET_ID;
}

export function isUnknownZipperAsset(asset: ZipperEnrichedAssetConfig): boolean {
    return asset.ledgerId === UNKNOWN_LEDGER_ASSET_ID;
}

export function resolveLedgerAssetByLedgerId(
    ledgerAssetId: number,
    lookup: (ledgerAssetId: number) => AssetConfig | null,
): AssetConfig {
    if (!Number.isInteger(ledgerAssetId) || ledgerAssetId <= 0) return unknownLedgerAsset;
    return lookup(ledgerAssetId) ?? unknownLedgerAsset;
}

export function resolveZipperAssetByLedgerId(
    ledgerAssetId: number,
    lookup: (ledgerAssetId: number) => ZipperEnrichedAssetConfig | null,
): ZipperEnrichedAssetConfig {
    if (!Number.isInteger(ledgerAssetId) || ledgerAssetId <= 0) return unknownZipperAsset;
    return lookup(ledgerAssetId) ?? unknownZipperAsset;
}
