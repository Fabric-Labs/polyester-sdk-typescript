import * as v from "../../shared/validation.js";
import type {
    DepositWithdrawConfig,
    ZipperAssetChainVariant,
    ZipperAssetConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
} from "../../shared/catalog-config.js";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";

export type {
    DepositWithdrawConfig,
    ZipperAssetChainVariant,
    ZipperAssetConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
};

export const ZipperChainConfigSchema = v.object({
    chainId: v.number(),
    code: v.string(),
    name: v.string(),
    nativeChainId: v.optional(v.string(), ""),
    nativeCurrencySymbol: v.string(),
    explorerUrl: v.string(),
    icon: v.string(),
    requiredConfirmations: v.number(),
    confirmationTimeSeconds: v.number(),
    isCaseSensitive: v.optional(v.boolean(), false),
    minAddressLength: v.number(),
    maxAddressLength: v.number(),
});

const ZipperAssetChainVariantWireSchema = v.object({
    zippedAssetId: v.number(),
    chainId: v.number(),
    isNativeAsset: v.optional(v.boolean(), false),
    networkFee: v.optional(v.string(), "0"),
    networkFeeTsSec: v.pipe(v.optional(v.bigint(), 0n), v.transform(Number)),
    ztokenAddress: v.optional(v.string(), ""),
    sourceAddress: v.optional(v.string(), ""),
    sourceDecimals: v.optional(v.number(), 18),
    ztokenDecimals: v.optional(v.number(), 18),
    depositMinAmount: v.optional(v.string(), ""),
    withdrawMinAmount: v.optional(v.string(), ""),
    supplyQ: v.optional(v.bigint(), 0n),
});

function normalizeZipperAssetChainVariant(
    quantityScale: number,
    {
        sourceAddress,
        sourceDecimals,
        supplyQ,
        ztokenAddress,
        ztokenDecimals,
        ...variant
    }: v.InferOutput<typeof ZipperAssetChainVariantWireSchema>,
): ZipperAssetChainVariant {
    return {
        ...variant,
        supply: scaledToDecimalOutput(supplyQ, quantityScale),
        sourceToken: {
            address: sourceAddress,
            decimals: sourceDecimals,
        },
        zToken: {
            address: ztokenAddress,
            decimals: ztokenDecimals,
        },
    };
}

export const ZipperAssetConfigSchema = v.pipe(
    v.object({
        asset: v.string(),
        ledgerId: v.number(),
        name: v.string(),
        icon: v.string(),
        quantityScale: v.number(),
        quantityDisplayDecimals: v.number(),
        variants: v.array(ZipperAssetChainVariantWireSchema),
        uAssetId: v.optional(v.string(), ""),
    }),
    v.transform(({ variants, ...asset }) => ({
        ...asset,
        variants: variants.map((variant) =>
            normalizeZipperAssetChainVariant(asset.quantityScale, variant),
        ),
    })),
);

export const ZipperChainContractConfigSchema = v.object({
    name: v.string(),
    address: v.string(),
    type: v.optional(v.string(), ""),
    description: v.optional(v.string(), ""),
    version: v.optional(v.number(), 0),
});

export const DepositWithdrawConfigSchema = v.pipe(
    v.object({
        chains: v.array(ZipperChainConfigSchema),
        assets: v.array(ZipperAssetConfigSchema),
        tsSec: v.bigint(),
        polyesterChainId: v.number(),
        contracts: v.optional(v.array(ZipperChainContractConfigSchema), []),
    }),
    v.transform(({ tsSec, ...config }) => ({
        ...config,
        tsMs: Number(tsSec) * 1000,
    })),
);

const ZippedAssetSupplyUpdateWireSchema = v.object({
    zippedAssetId: v.number(),
    supplyQ: v.bigint(),
});

export type ZippedAssetSupplyUpdate = {
    zippedAssetId: number;
    supply: string;
};

export type ZippedAssetSupplyBatch = {
    updates: ZippedAssetSupplyUpdate[];
};

export function createZippedAssetSupplyBatchSchema(scales: SdkScales) {
    return v.pipe(
        v.object({
            updates: v.array(ZippedAssetSupplyUpdateWireSchema),
        }),
        v.transform(
            (batch): ZippedAssetSupplyBatch => ({
                updates: batch.updates.map((update) => ({
                    zippedAssetId: update.zippedAssetId,
                    supply: scaledToDecimalOutput(
                        update.supplyQ,
                        scales.zippedAssetAmount(update.zippedAssetId),
                    ),
                })),
            }),
        ),
    );
}
