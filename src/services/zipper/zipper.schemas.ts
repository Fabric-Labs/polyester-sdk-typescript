import { z } from "zod";

export const ZipperChainConfigSchema = z.object({
	chainId: z.number(),
	code: z.string(),
	name: z.string(),
	nativeChainId: z.string().default(""),
	nativeCurrencySymbol: z.string(),
	explorerUrl: z.string(),
	icon: z.string(),
	requiredConfirmations: z.number(),
	confirmationTimeSeconds: z.number(),
	isCaseSensitive: z.boolean().default(false),
	minAddressLength: z.number(),
	maxAddressLength: z.number(),
});

export type ZipperChainConfig = z.output<typeof ZipperChainConfigSchema>;

export const ZipperAssetChainVariantSchema = z
	.object({
		chainAssetId: z.number(),
		chainId: z.number(),
		isNativeAsset: z.boolean().default(false),
		networkFee: z.string().default("0"),
		networkFeeTsSec: z.bigint().default(0n).transform(Number),
		ztokenAddress: z.string().optional().default(""),
		sourceAddress: z.string().default(""),
		sourceDecimals: z.number().default(18),
		ztokenDecimals: z.number().default(18),
		depositMinAmount: z.string().default(""),
		withdrawMinAmount: z.string().default(""),
	})
	.transform(({ sourceAddress, sourceDecimals, ztokenAddress, ztokenDecimals, ...variant }) => ({
		...variant,
		sourceToken: {
			address: sourceAddress,
			decimals: sourceDecimals,
		},
		zToken: {
			address: ztokenAddress,
			decimals: ztokenDecimals,
		},
	}));

export type ZipperAssetChainVariant = z.output<typeof ZipperAssetChainVariantSchema>;

export const ZipperAssetConfigSchema = z.object({
	asset: z.string(),
	ledgerId: z.number(),
	name: z.string(),
	icon: z.string(),
	quantityScale: z.number(),
	quantityDisplayDecimals: z.number(),
	variants: z.array(ZipperAssetChainVariantSchema),
	uAssetId: z.string().default(""),
});

export type ZipperAssetConfig = z.output<typeof ZipperAssetConfigSchema>;

export const ZipperChainContractConfigSchema = z.object({
	name: z.string(),
	address: z.string(),
	type: z.string().default(""),
	description: z.string().default(""),
	version: z.number().default(0),
});

export type ZipperChainContractConfig = z.output<typeof ZipperChainContractConfigSchema>;

export const DepositWithdrawConfigSchema = z
	.object({
		chains: z.array(ZipperChainConfigSchema),
		assets: z.array(ZipperAssetConfigSchema),
		tsSec: z.bigint(),
		polyesterChainId: z.number(),
		contracts: z.array(ZipperChainContractConfigSchema).default([]),
	})
	.transform(({ tsSec, ...config }) => ({
		...config,
		tsMs: Number(tsSec) * 1000,
	}));

export type DepositWithdrawConfig = z.output<typeof DepositWithdrawConfigSchema>;
