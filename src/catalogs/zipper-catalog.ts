import type { ZipperContractName } from "./zipper-catalog.generated.js";
import type {
    DepositWithdrawConfig,
    ZipperAssetChainVariant,
    ZipperAssetConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
} from "../services/zipper/zipper.schemas.js";

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

let legacyChainByCode = new Map<string, ZipperChainConfig>();
let legacyChainById = new Map<number, ZipperChainConfig>();
let legacyAssetBySymbol = new Map<string, ZipperEnrichedAssetConfig>();
let legacyAssetByLedgerId = new Map<number, ZipperEnrichedAssetConfig>();
let legacyContractByName = new Map<string, ZipperChainContractConfig>();
let legacyZipperCatalogListener:
    | ((zipper: {
          chains: readonly ZipperChainConfig[];
          assets: readonly ZipperEnrichedAssetConfig[];
          contracts: readonly ZipperChainContractConfig[];
      }) => void)
    | undefined;

export function setLegacyZipperCatalogListener(
    listener: (zipper: {
        chains: readonly ZipperChainConfig[];
        assets: readonly ZipperEnrichedAssetConfig[];
        contracts: readonly ZipperChainContractConfig[];
    }) => void,
): void {
    legacyZipperCatalogListener = listener;
}

function notifyLegacyZipperCatalogListener(): void {
    legacyZipperCatalogListener?.({
        chains: getAllZipperChains(),
        assets: getAllZipperAssets(),
        contracts: getAllZipperContracts(),
    });
}

export function setZipperChainsCatalog(chains: readonly ZipperChainConfig[]): void {
    legacyChainByCode = new Map(chains.map((chain) => [chain.code, chain]));
    legacyChainById = new Map(chains.map((chain) => [chain.chainId, chain]));
    notifyLegacyZipperCatalogListener();
}

export function setZipperAssetsCatalog(assets: readonly ZipperEnrichedAssetConfig[]): void {
    legacyAssetBySymbol = new Map(assets.map((asset) => [asset.asset, asset]));
    legacyAssetByLedgerId = new Map(assets.map((asset) => [asset.ledgerId, asset]));
    notifyLegacyZipperCatalogListener();
}

export function setZipperContractsCatalog(contracts: readonly ZipperChainContractConfig[]): void {
    legacyContractByName = new Map(contracts.map((contract) => [contract.name, contract]));
    notifyLegacyZipperCatalogListener();
}

export function getZipperChain(code: string): ZipperChainConfig | undefined {
    return legacyChainByCode.get(code);
}

export function getZipperChainById(chainId: number): ZipperChainConfig | undefined {
    return legacyChainById.get(chainId);
}

export function getAllZipperChains(): ZipperChainConfig[] {
    return Array.from(legacyChainByCode.values());
}

export function getZipperAsset(asset: string): ZipperEnrichedAssetConfig | undefined {
    return legacyAssetBySymbol.get(asset);
}

export function getZipperAssetByLedgerId(ledgerId: number): ZipperEnrichedAssetConfig | undefined {
    return legacyAssetByLedgerId.get(ledgerId);
}

export function getAllZipperAssets(): ZipperEnrichedAssetConfig[] {
    return Array.from(legacyAssetBySymbol.values());
}

export function getZipperContractByName(
    name: ZipperContractName,
): ZipperChainContractConfig | undefined {
    return legacyContractByName.get(name);
}

export function getAllZipperContracts(): ZipperChainContractConfig[] {
    return Array.from(legacyContractByName.values());
}
