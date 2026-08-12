import * as v from "valibot";
import { ValidationError } from "../shared/errors.js";
import { PAIR_STATUSES } from "../shared/catalog-config.js";
import type { CatalogSnapshot } from "./types.js";
import type { ZippedAssetSupplyCatalogUpdate } from "./zipper-supply.js";

const FiniteNumberSchema = v.pipe(v.number(), v.finite());
const IntegerSchema = v.pipe(FiniteNumberSchema, v.safeInteger());

const AssetConfigSchema = v.object({
    symbol: v.string(),
    ledgerId: IntegerSchema,
    name: v.string(),
    quantityDisplayDecimals: IntegerSchema,
    quantityScale: IntegerSchema,
});

const PairMarketDataConfigSchema = v.object({
    orderbookPriceBuckets: v.array(FiniteNumberSchema),
});

const EnrichedPairConfigSchema = v.object({
    symbolId: IntegerSchema,
    symbol: v.string(),
    baseAsset: AssetConfigSchema,
    quoteAsset: AssetConfigSchema,
    tickSize: v.string(),
    stepSize: v.string(),
    minNotionalQuote: v.string(),
    minQtyBase: v.string(),
    allowBuyFeeFromBase: v.boolean(),
    defaultMarketSlippagePctBuy: FiniteNumberSchema,
    defaultMarketSlippagePctSell: FiniteNumberSchema,
    maxClientRefDriftPct: FiniteNumberSchema,
    marketdata: v.optional(PairMarketDataConfigSchema),
    listingAt: v.nullable(FiniteNumberSchema),
    delistingAt: v.nullable(FiniteNumberSchema),
    status: v.picklist([...PAIR_STATUSES, "unknown"]),
});

const ZipperChainConfigSchema = v.object({
    chainId: IntegerSchema,
    code: v.string(),
    name: v.string(),
    nativeChainId: v.string(),
    nativeCurrencySymbol: v.string(),
    explorerUrl: v.string(),
    icon: v.string(),
    requiredConfirmations: IntegerSchema,
    confirmationTimeSeconds: IntegerSchema,
    isCaseSensitive: v.boolean(),
    minAddressLength: IntegerSchema,
    maxAddressLength: IntegerSchema,
});

const ZipperTokenConfigSchema = v.object({
    address: v.string(),
    decimals: IntegerSchema,
});

const ZipperEnrichedAssetChainSchema = v.object({
    ...ZipperChainConfigSchema.entries,
    zippedAssetId: IntegerSchema,
    isNativeAsset: v.boolean(),
    networkFee: v.optional(v.string()),
    networkFeeTsSec: v.optional(FiniteNumberSchema),
    depositMinAmount: v.optional(v.string()),
    withdrawMinAmount: v.optional(v.string()),
    supply: v.optional(v.string()),
    sourceToken: ZipperTokenConfigSchema,
    zToken: ZipperTokenConfigSchema,
});

const ZipperEnrichedAssetConfigSchema = v.object({
    asset: v.string(),
    ledgerId: IntegerSchema,
    name: v.string(),
    icon: v.string(),
    quantityScale: IntegerSchema,
    quantityDisplayDecimals: IntegerSchema,
    uAssetId: v.string(),
    chains: v.array(ZipperEnrichedAssetChainSchema),
});

const ZipperChainContractConfigSchema = v.object({
    name: v.string(),
    address: v.string(),
    type: v.string(),
    description: v.string(),
    version: IntegerSchema,
});

const CatalogSnapshotShapeSchema = v.object({
    source: v.picklist(["api", "snapshot"]),
    tsMs: FiniteNumberSchema,
    version: IntegerSchema,
    market: v.object({
        assets: v.array(AssetConfigSchema),
        pairs: v.array(EnrichedPairConfigSchema),
        tsSec: v.optional(FiniteNumberSchema),
    }),
    zipper: v.object({
        chains: v.array(ZipperChainConfigSchema),
        assets: v.array(ZipperEnrichedAssetConfigSchema),
        contracts: v.array(ZipperChainContractConfigSchema),
        tsMs: v.optional(FiniteNumberSchema),
    }),
});

const ZippedAssetSupplyCatalogUpdatesSchema = v.array(
    v.object({
        zippedAssetId: IntegerSchema,
        supply: v.string(),
    }),
);

const parsedSnapshots = new WeakMap<object, CatalogSnapshot>();

function hasValidRelationships(
    snapshot: v.InferOutput<typeof CatalogSnapshotShapeSchema>,
): boolean {
    const assetSymbols = new Set(snapshot.market.assets.map((asset) => asset.symbol));
    if (
        snapshot.market.pairs.some(
            (pair) =>
                !assetSymbols.has(pair.baseAsset.symbol) ||
                !assetSymbols.has(pair.quoteAsset.symbol),
        )
    ) {
        return false;
    }

    const chainIds = new Set(snapshot.zipper.chains.map((chain) => chain.chainId));
    return snapshot.zipper.assets.every((asset) =>
        asset.chains.every((chain) => chainIds.has(chain.chainId)),
    );
}

const CatalogSnapshotSchema = v.custom<CatalogSnapshot>((value) => {
    const result = v.safeParse(CatalogSnapshotShapeSchema, value);
    return result.success && hasValidRelationships(result.output);
});

/** Parses and caches untrusted SSR or JavaScript input as a catalog snapshot. */
export function parseCatalogSnapshot(value: unknown): CatalogSnapshot {
    if (typeof value !== "object" || value === null) {
        throw new ValidationError("Catalog snapshot is malformed.");
    }

    const cached = parsedSnapshots.get(value);
    if (cached) return cached;

    const result = v.safeParse(CatalogSnapshotSchema, value);
    if (!result.success) {
        throw new ValidationError("Catalog snapshot is malformed.");
    }

    const snapshot: CatalogSnapshot = result.output;
    parsedSnapshots.set(value, snapshot);
    parsedSnapshots.set(snapshot, snapshot);
    return snapshot;
}

/** Parses supply updates before they can advance a snapshot's version or timestamp. */
export function parseZippedAssetSupplyCatalogUpdates(
    value: unknown,
): readonly ZippedAssetSupplyCatalogUpdate[] {
    const result = v.safeParse(ZippedAssetSupplyCatalogUpdatesSchema, value);
    if (!result.success) {
        throw new ValidationError("Zipper catalog supply updates are malformed.");
    }
    return result.output;
}
