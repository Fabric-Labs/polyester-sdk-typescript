import type {
    DepositWithdrawConfig,
    ZipperAssetChainVariant,
    ZipperAssetConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
} from "./config-types.js";
import type { ZipperContractName } from "./zipper-catalog.generated.js";

export type {
    DepositWithdrawConfig,
    ZipperAssetConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
};

export type ZipperEnrichedAssetChain = ZipperChainConfig & {
    chainAssetId: ZipperAssetChainVariant["chainAssetId"];
    isNativeAsset: ZipperAssetChainVariant["isNativeAsset"];
    networkFee?: ZipperAssetChainVariant["networkFee"];
    networkFeeTsSec?: ZipperAssetChainVariant["networkFeeTsSec"];
    depositMinAmount?: ZipperAssetChainVariant["depositMinAmount"];
    withdrawMinAmount?: ZipperAssetChainVariant["withdrawMinAmount"];
    sourceToken: ZipperAssetChainVariant["sourceToken"];
    zToken: ZipperAssetChainVariant["zToken"];
};

export type ZipperEnrichedAssetConfig = Omit<ZipperAssetConfig, "variants"> & {
    chains: ZipperEnrichedAssetChain[];
};

export interface ZipperCatalogData {
    readonly chains: readonly ZipperChainConfig[];
    readonly assets: readonly ZipperEnrichedAssetConfig[];
    readonly contracts: readonly ZipperChainContractConfig[];
    readonly tsMs?: number;
}

export type ZipperCatalogSeed =
    | DepositWithdrawConfig
    | {
          readonly chains: readonly ZipperChainConfig[];
          readonly assets: readonly (ZipperAssetConfig | ZipperEnrichedAssetConfig)[];
          readonly contracts?: readonly ZipperChainContractConfig[];
          readonly tsMs?: number;
      };

function isEnrichedZipperAsset(
    asset: ZipperAssetConfig | ZipperEnrichedAssetConfig,
): asset is ZipperEnrichedAssetConfig {
    return "chains" in asset;
}

/**
 * Adds derived display metadata to Zipper asset records.
 */
export function enrichZipperAssets(
    assets: readonly (ZipperAssetConfig | ZipperEnrichedAssetConfig)[],
    chains: readonly ZipperChainConfig[],
): readonly ZipperEnrichedAssetConfig[] {
    const chainById = new Map(chains.map((chain) => [chain.chainId, chain]));
    const enrichedAssets: ZipperEnrichedAssetConfig[] = [];

    for (const asset of assets) {
        if (isEnrichedZipperAsset(asset)) {
            enrichedAssets.push(asset);
            continue;
        }

        const { variants, ...rest } = asset;
        const enrichedChains: ZipperEnrichedAssetChain[] = [];

        for (const variant of variants) {
            const chain = chainById.get(variant.chainId);
            if (!chain) {
                throw new Error(
                    `[catalog] zipper asset ${asset.asset} references unknown chainId: ${variant.chainId}`,
                );
            }

            enrichedChains.push({
                ...chain,
                chainAssetId: variant.chainAssetId,
                isNativeAsset: variant.isNativeAsset,
                networkFee: variant.networkFee,
                networkFeeTsSec: variant.networkFeeTsSec,
                depositMinAmount: variant.depositMinAmount,
                withdrawMinAmount: variant.withdrawMinAmount,
                sourceToken: variant.sourceToken,
                zToken: variant.zToken,
            });
        }

        enrichedAssets.push({
            ...rest,
            chains: enrichedChains,
        });
    }

    return enrichedAssets;
}

export function buildZipperCatalogData(seed: ZipperCatalogSeed): ZipperCatalogData {
    const chains = [...seed.chains];
    const assets = enrichZipperAssets(seed.assets, chains);
    return Object.freeze({
        chains: Object.freeze(chains),
        assets: Object.freeze([...assets]),
        contracts: Object.freeze([...(seed.contracts ?? [])]),
        tsMs: seed.tsMs,
    });
}

export type { ZipperContractName };
