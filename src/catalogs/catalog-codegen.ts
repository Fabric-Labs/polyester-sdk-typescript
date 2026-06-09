import type {
    AssetConfig,
    DepositWithdrawConfig,
    SpotConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
} from "./config-types.js";
import {
    buildMarketCatalogData,
    type EnrichedPairConfig,
    type MarketCatalogData,
} from "./market-data-catalog.js";
import type { CatalogSnapshot } from "./types.js";
import {
    buildZipperCatalogData,
    type ZipperCatalogData,
    type ZipperEnrichedAssetConfig,
} from "./zipper-catalog.js";

const REFRESH_COMMAND = "bun run refresh:catalogs:testnet";

function assertNonEmpty(name: string, values: readonly unknown[]): void {
    if (values.length === 0) throw new Error(`[catalog] ${name} must not be empty`);
}

function assertUnique<T>(
    name: string,
    values: readonly T[],
    keyFor: (value: T) => string | number,
): void {
    const seen = new Set<string | number>();
    for (const value of values) {
        const key = keyFor(value);
        if (seen.has(key)) throw new Error(`[catalog] duplicate ${name}: ${String(key)}`);
        seen.add(key);
    }
}

export function validateMarketCatalogData(data: MarketCatalogData): void {
    assertNonEmpty("market assets", data.assets);
    assertNonEmpty("market pairs", data.pairs);
    assertUnique("market asset symbol", data.assets, (asset) => asset.symbol);
    assertUnique("market asset ledgerId", data.assets, (asset) => asset.ledgerId);
    assertUnique("market pair symbol", data.pairs, (pair) => pair.symbol);
    assertUnique("market pair symbolId", data.pairs, (pair) => pair.symbolId);

    const assetSymbols = new Set(data.assets.map((asset) => asset.symbol));
    for (const pair of data.pairs) {
        if (!assetSymbols.has(pair.baseAsset.symbol)) {
            throw new Error(
                `[catalog] market pair ${pair.symbol} references unknown base asset: ${pair.baseAsset.symbol}`,
            );
        }
        if (!assetSymbols.has(pair.quoteAsset.symbol)) {
            throw new Error(
                `[catalog] market pair ${pair.symbol} references unknown quote asset: ${pair.quoteAsset.symbol}`,
            );
        }
    }
}

export function validateZipperCatalogData(data: ZipperCatalogData): void {
    assertNonEmpty("zipper chains", data.chains);
    assertNonEmpty("zipper assets", data.assets);
    assertNonEmpty("zipper contracts", data.contracts);
    assertUnique("zipper chain code", data.chains, (chain) => chain.code);
    assertUnique("zipper chainId", data.chains, (chain) => chain.chainId);
    assertUnique("zipper asset symbol", data.assets, (asset) => asset.asset);
    assertUnique("zipper asset ledgerId", data.assets, (asset) => asset.ledgerId);
    assertUnique("zipper contract name", data.contracts, (contract) => contract.name);

    const chainIds = new Set(data.chains.map((chain) => chain.chainId));
    for (const asset of data.assets) {
        assertNonEmpty(`zipper asset ${asset.asset} chains`, asset.chains);
        for (const chain of asset.chains) {
            if (!chainIds.has(chain.chainId)) {
                throw new Error(
                    `[catalog] zipper asset ${asset.asset} references unknown chainId: ${chain.chainId}`,
                );
            }
        }
    }
}

export function validateCatalogSnapshot(snapshot: CatalogSnapshot): void {
    validateMarketCatalogData(snapshot.market);
    validateZipperCatalogData(snapshot.zipper);

    const marketAssetByLedgerId = new Map(
        snapshot.market.assets.map((asset) => [asset.ledgerId, asset]),
    );
    for (const zipperAsset of snapshot.zipper.assets) {
        const marketAsset = marketAssetByLedgerId.get(zipperAsset.ledgerId);
        if (!marketAsset) {
            throw new Error(
                `[catalog] zipper asset ${zipperAsset.asset} references unknown market ledgerId: ${zipperAsset.ledgerId}`,
            );
        }
        if (marketAsset.symbol !== zipperAsset.asset) {
            throw new Error(
                `[catalog] zipper asset ${zipperAsset.asset} ledgerId ${zipperAsset.ledgerId} does not match market asset ${marketAsset.symbol}`,
            );
        }
    }
}

export function renderMarketDataCatalogModule(spotConfig: SpotConfig): string {
    const catalogData = buildMarketCatalogData(spotConfig);
    validateMarketCatalogData(catalogData);

    return `// AUTO-GENERATED FILE - DO NOT EDIT
// Run \`${REFRESH_COMMAND}\` to regenerate

import type { AssetConfig } from "./config-types.js";
import type { EnrichedPairConfig } from "./market-data-catalog.js";

export const ASSET_CATALOG: AssetConfig[] = ${JSON.stringify(catalogData.assets, null, 4)};

export const PAIR_CATALOG: EnrichedPairConfig[] = ${JSON.stringify(catalogData.pairs, null, 4)};
`;
}

export function renderZipperCatalogModule(config: DepositWithdrawConfig): string {
    const zipperData = buildZipperCatalogData(config);
    validateZipperCatalogData(zipperData);
    const contractNames = zipperData.contracts.map((contract) => contract.name);

    return `// AUTO-GENERATED FILE - DO NOT EDIT
// Run \`${REFRESH_COMMAND}\` to regenerate

import type { ZipperEnrichedAssetConfig, ZipperChainConfig, ZipperChainContractConfig } from "./zipper-catalog.js";

export const ZIPPER_CHAIN_CATALOG: ZipperChainConfig[] = ${JSON.stringify(zipperData.chains, null, 4)};

export const ZIPPER_ASSET_CATALOG: ZipperEnrichedAssetConfig[] = ${JSON.stringify(zipperData.assets, null, 4)};

export const ZIPPER_CONTRACTS_CATALOG: ZipperChainContractConfig[] = ${JSON.stringify(zipperData.contracts, null, 4)};

export const ZIPPER_CONTRACT_NAMES = ${JSON.stringify(contractNames, null, 4)} as const;

export type ZipperContractName = (typeof ZIPPER_CONTRACT_NAMES)[number];
`;
}

export type {
    AssetConfig,
    DepositWithdrawConfig,
    EnrichedPairConfig,
    SpotConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
    ZipperEnrichedAssetConfig,
};
