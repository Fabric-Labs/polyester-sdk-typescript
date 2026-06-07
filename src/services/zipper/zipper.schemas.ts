import * as v from "valibot";

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

export type ZipperChainConfig = v.InferOutput<typeof ZipperChainConfigSchema>;

export const ZipperAssetChainVariantSchema = v.pipe(
    v.object({
        chainAssetId: v.number(),
        chainId: v.number(),
        isNativeAsset: v.optional(v.boolean(), false),
        networkFee: v.optional(v.string(), "0"),
        networkFeeTsSec: v.pipe(v.optional(v.bigint(), 0n), v.transform(Number)),
        ztokenAddress: v.optional(v.optional(v.string()), ""),
        sourceAddress: v.optional(v.string(), ""),
        sourceDecimals: v.optional(v.number(), 18),
        ztokenDecimals: v.optional(v.number(), 18),
        depositMinAmount: v.optional(v.string(), ""),
        withdrawMinAmount: v.optional(v.string(), ""),
    }),
    v.transform(({ sourceAddress, sourceDecimals, ztokenAddress, ztokenDecimals, ...variant }) => ({
        ...variant,
        sourceToken: {
            address: sourceAddress,
            decimals: sourceDecimals,
        },
        zToken: {
            address: ztokenAddress,
            decimals: ztokenDecimals,
        },
    })),
);

export type ZipperAssetChainVariant = v.InferOutput<typeof ZipperAssetChainVariantSchema>;

export const ZipperAssetConfigSchema = v.object({
    asset: v.string(),
    ledgerId: v.number(),
    name: v.string(),
    icon: v.string(),
    quantityScale: v.number(),
    quantityDisplayDecimals: v.number(),
    variants: v.array(ZipperAssetChainVariantSchema),
    uAssetId: v.optional(v.string(), ""),
});

export type ZipperAssetConfig = v.InferOutput<typeof ZipperAssetConfigSchema>;

export const ZipperChainContractConfigSchema = v.object({
    name: v.string(),
    address: v.string(),
    type: v.optional(v.string(), ""),
    description: v.optional(v.string(), ""),
    version: v.optional(v.number(), 0),
});

export type ZipperChainContractConfig = v.InferOutput<typeof ZipperChainContractConfigSchema>;

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

export type DepositWithdrawConfig = v.InferOutput<typeof DepositWithdrawConfigSchema>;
