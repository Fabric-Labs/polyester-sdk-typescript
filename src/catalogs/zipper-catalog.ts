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

const FALLBACK_ZIPPER_CHAIN: ZipperChainConfig = {
    chainId: 0,
    code: "",
    name: "",
    nativeChainId: "",
    nativeCurrencySymbol: "",
    explorerUrl: "",
    icon: "",
    requiredConfirmations: 0,
    confirmationTimeSeconds: 0,
    isCaseSensitive: false,
    minAddressLength: 0,
    maxAddressLength: 0,
};

const FALLBACK_ZIPPER_ASSET: ZipperEnrichedAssetConfig = {
    asset: "",
    ledgerId: 0,
    name: "",
    icon: "",
    quantityScale: 0,
    quantityDisplayDecimals: 0,
    uAssetId: "",
    chains: [],
};

function createFallbackZipperChain(chainId: number): ZipperChainConfig {
    const label = `Chain ${chainId}`;
    return {
        ...FALLBACK_ZIPPER_CHAIN,
        chainId,
        code: `chain-${chainId}`,
        name: label,
    };
}

let ZIPPER_CHAIN_CATALOG = new Map<string, ZipperChainConfig>();
let ZIPPER_CHAIN_BY_ID = new Map<number, ZipperChainConfig>();
let ZIPPER_ASSET_CATALOG = new Map<string, ZipperEnrichedAssetConfig>();
let ZIPPER_ASSET_BY_LEDGER_ID = new Map<number, ZipperEnrichedAssetConfig>();
let ZIPPER_CONTRACTS_CATALOG = new Map<string, ZipperChainContractConfig>();

export function setZipperChainsCatalog(chains: ZipperChainConfig[]): void {
    const byCode = new Map<string, ZipperChainConfig>();
    const byId = new Map<number, ZipperChainConfig>();

    for (const chain of chains) {
        byCode.set(chain.code, chain);
        byId.set(chain.chainId, chain);
    }

    ZIPPER_CHAIN_CATALOG = byCode;
    ZIPPER_CHAIN_BY_ID = byId;
}

export function setZipperAssetsCatalog(assets: ZipperEnrichedAssetConfig[]): void {
    const byAsset = new Map<string, ZipperEnrichedAssetConfig>();
    const byLedgerId = new Map<number, ZipperEnrichedAssetConfig>();

    for (const asset of assets) {
        byAsset.set(asset.asset, asset);
        byLedgerId.set(asset.ledgerId, asset);
    }

    ZIPPER_ASSET_CATALOG = byAsset;
    ZIPPER_ASSET_BY_LEDGER_ID = byLedgerId;
}

export function setZipperContractsCatalog(contracts: ZipperChainContractConfig[]): void {
    const byName = new Map<string, ZipperChainContractConfig>();

    for (const contract of contracts) {
        byName.set(contract.name, contract);
    }

    ZIPPER_CONTRACTS_CATALOG = byName;
}

export function enrichZipperAssets(
    assets: ZipperAssetConfig[],
    chains: ZipperChainConfig[],
): ZipperEnrichedAssetConfig[] {
    const chainById = new Map(chains.map((chain) => [chain.chainId, chain]));
    const enrichedAssets: ZipperEnrichedAssetConfig[] = [];

    for (const asset of assets) {
        const { variants, ...rest } = asset;
        const enrichedChains: ZipperEnrichedAssetChain[] = [];

        for (const variant of variants) {
            const chain =
                chainById.get(variant.chainId) ?? createFallbackZipperChain(variant.chainId);

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

export function hydrateZipperCatalog(config: DepositWithdrawConfig): void {
    setZipperChainsCatalog(config.chains);
    setZipperAssetsCatalog(enrichZipperAssets(config.assets, config.chains));
    setZipperContractsCatalog(config.contracts);
}

export function getZipperChain(code: string): ZipperChainConfig {
    return ZIPPER_CHAIN_CATALOG.get(code) ?? FALLBACK_ZIPPER_CHAIN;
}

export function getZipperChainById(chainId: number): ZipperChainConfig {
    return ZIPPER_CHAIN_BY_ID.get(chainId) ?? FALLBACK_ZIPPER_CHAIN;
}

export function getAllZipperChains(): ZipperChainConfig[] {
    return Array.from(ZIPPER_CHAIN_CATALOG.values());
}

export function getZipperAsset(asset: string): ZipperEnrichedAssetConfig {
    return ZIPPER_ASSET_CATALOG.get(asset) ?? FALLBACK_ZIPPER_ASSET;
}

export function getZipperAssetByLedgerId(ledgerId: number): ZipperEnrichedAssetConfig {
    return ZIPPER_ASSET_BY_LEDGER_ID.get(ledgerId) ?? FALLBACK_ZIPPER_ASSET;
}

export function getAllZipperAssets(): ZipperEnrichedAssetConfig[] {
    return Array.from(ZIPPER_ASSET_CATALOG.values());
}

export function getZipperContractByName(
    name: ZipperContractName,
): ZipperChainContractConfig | undefined {
    return ZIPPER_CONTRACTS_CATALOG.get(name);
}

export function getAllZipperContracts(): ZipperChainContractConfig[] {
    return Array.from(ZIPPER_CONTRACTS_CATALOG.values());
}
