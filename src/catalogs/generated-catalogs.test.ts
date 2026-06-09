import { describe, expect, it } from "vitest";
import { ASSET_CATALOG, PAIR_CATALOG } from "./market-data-catalog.generated.js";
import { buildGeneratedCatalogSnapshot } from "./snapshot.js";
import {
    ZIPPER_ASSET_CATALOG,
    ZIPPER_CHAIN_CATALOG,
    ZIPPER_CONTRACTS_CATALOG,
    ZIPPER_CONTRACT_NAMES,
} from "./zipper-catalog.generated.js";

function duplicateKeys<T>(
    values: readonly T[],
    keyFor: (value: T) => string | number,
): (string | number)[] {
    const seen = new Set<string | number>();
    const duplicates: (string | number)[] = [];

    for (const value of values) {
        const key = keyFor(value);
        if (seen.has(key)) {
            duplicates.push(key);
            continue;
        }
        seen.add(key);
    }

    return duplicates;
}

describe("generated catalog invariants", () => {
    it("contains generated market and zipper snapshots", () => {
        const snapshot = buildGeneratedCatalogSnapshot();

        expect(snapshot.source).toBe("generated");
        expect(snapshot.market.assets.length).toBeGreaterThan(0);
        expect(snapshot.market.pairs.length).toBeGreaterThan(0);
        expect(snapshot.zipper.chains.length).toBeGreaterThan(0);
        expect(snapshot.zipper.assets.length).toBeGreaterThan(0);
        expect(snapshot.zipper.contracts.length).toBeGreaterThan(0);
    });

    it("keeps market lookup keys unique", () => {
        expect(duplicateKeys(ASSET_CATALOG, (asset) => asset.symbol)).toEqual([]);
        expect(duplicateKeys(ASSET_CATALOG, (asset) => asset.ledgerId)).toEqual([]);
        expect(duplicateKeys(PAIR_CATALOG, (pair) => pair.symbol)).toEqual([]);
        expect(duplicateKeys(PAIR_CATALOG, (pair) => pair.symbolId)).toEqual([]);
    });

    it("keeps enriched market pairs aligned with the asset catalog", () => {
        const assetBySymbol = new Map(ASSET_CATALOG.map((asset) => [asset.symbol, asset]));

        for (const pair of PAIR_CATALOG) {
            expect(assetBySymbol.get(pair.baseAsset.symbol)).toEqual(pair.baseAsset);
            expect(assetBySymbol.get(pair.quoteAsset.symbol)).toEqual(pair.quoteAsset);
        }
    });

    it("keeps zipper lookup keys unique", () => {
        expect(duplicateKeys(ZIPPER_CHAIN_CATALOG, (chain) => chain.code)).toEqual([]);
        expect(duplicateKeys(ZIPPER_CHAIN_CATALOG, (chain) => chain.chainId)).toEqual([]);
        expect(duplicateKeys(ZIPPER_ASSET_CATALOG, (asset) => asset.asset)).toEqual([]);
        expect(duplicateKeys(ZIPPER_ASSET_CATALOG, (asset) => asset.ledgerId)).toEqual([]);
        expect(duplicateKeys(ZIPPER_CONTRACTS_CATALOG, (contract) => contract.name)).toEqual([]);
    });

    it("keeps zipper asset chains aligned with the chain catalog", () => {
        const chainById = new Map(ZIPPER_CHAIN_CATALOG.map((chain) => [chain.chainId, chain]));

        for (const asset of ZIPPER_ASSET_CATALOG) {
            expect(asset.chains.length).toBeGreaterThan(0);

            for (const chain of asset.chains) {
                expect(chainById.get(chain.chainId)).toMatchObject({
                    chainId: chain.chainId,
                    code: chain.code,
                    name: chain.name,
                });
            }
        }
    });

    it("keeps generated zipper contract names aligned with contracts", () => {
        expect(ZIPPER_CONTRACT_NAMES).toEqual(
            ZIPPER_CONTRACTS_CATALOG.map((contract) => contract.name),
        );
    });
});
