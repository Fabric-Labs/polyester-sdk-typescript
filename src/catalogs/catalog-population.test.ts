import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { GetSpotConfigResponseSchema } from "../gen/marketdata/v1/marketdata_pb.js";
import { GetDepositWithdrawConfigResponseSchema } from "../gen/chain/zipper/v1/zipper_pb.js";
import { SpotConfigSchema } from "../services/market-data/market-data.schemas.js";
import { DepositWithdrawConfigSchema } from "../services/zipper/zipper.schemas.js";
import { createPolyesterCatalog } from "./client-catalog.js";
import { createCatalogSnapshotReader } from "./readers.js";
import type { CatalogSnapshot } from "./types.js";

function configs() {
    const market = v.parse(
        SpotConfigSchema,
        create(GetSpotConfigResponseSchema, {
            assets: [
                {
                    asset: "BTC",
                    ledgerId: 1,
                    name: "Bitcoin",
                    quantityScale: 8,
                    quantityDisplayDecimals: 5,
                },
                {
                    asset: "USDC",
                    ledgerId: 2,
                    name: "USD Coin",
                    quantityScale: 6,
                    quantityDisplayDecimals: 2,
                },
            ],
            pairs: [
                {
                    symbolId: 10,
                    symbol: "BTC-USDC",
                    baseAsset: "BTC",
                    quoteAsset: "USDC",
                    baseQuantityScale: 8,
                    quoteQuantityScale: 6,
                    tickSize: "0.01",
                    stepSize: "0.00001",
                    minNotionalQuote: "1",
                    minQtyBase: "0.00001",
                    allowBuyFeeFromBase: true,
                    defaultMarketSlippageBpsBuy: 100,
                    defaultMarketSlippageBpsSell: 200,
                    maxClientRefDriftBps: 300,
                    marketdata: { orderbookPriceBuckets: [0.01, 1] },
                    listingAt: { seconds: 100n, nanos: 0 },
                    delistingAt: { seconds: 200n, nanos: 0 },
                    status: 1,
                },
            ],
            tsSec: 123n,
        }),
    );
    const zipper = v.parse(
        DepositWithdrawConfigSchema,
        create(GetDepositWithdrawConfigResponseSchema, {
            polyesterChainId: 777,
            tsSec: 456n,
            chains: [
                {
                    chainId: 1,
                    code: "ETH",
                    name: "Ethereum",
                    nativeChainId: "1",
                    nativeCurrencySymbol: "ETH",
                    explorerUrl: "https://example.com",
                    icon: "eth.svg",
                    requiredConfirmations: 12,
                    confirmationTimeSeconds: 12,
                    isCaseSensitive: true,
                    minAddressLength: 42,
                    maxAddressLength: 42,
                },
            ],
            assets: [
                {
                    asset: "USDC",
                    ledgerId: 2,
                    name: "USD Coin",
                    icon: "usdc.svg",
                    quantityScale: 6,
                    quantityDisplayDecimals: 2,
                    uAssetId: "universal-usdc",
                    variants: [
                        {
                            chainId: 1,
                            zippedAssetId: 101,
                            isNativeAsset: true,
                            networkFee: "0.01",
                            sourceAddress: "source",
                            sourceDecimals: 6,
                            ztokenAddress: "wrapped",
                            ztokenDecimals: 18,
                            depositMinAmount: "1",
                            withdrawMinAmount: "2",
                            supplyQ: 123456789n,
                        },
                    ],
                },
            ],
            contracts: [
                {
                    name: "fundingAccount",
                    address: "funding",
                    type: "safe",
                    description: "Funding",
                    version: 2,
                },
            ],
        }),
    );
    return { market, zipper };
}

describe("catalog population", () => {
    it("retains every normalized backend field through refresh, reactive storage and snapshot hydration", async () => {
        const { market, zipper } = configs();
        let stored: CatalogSnapshot | undefined;
        const catalog = createPolyesterCatalog({
            cell: {
                get: () => stored,
                set: (snapshot) => {
                    stored = snapshot;
                },
            },
            refresh: { market: async () => market, zipper: async () => zipper },
        });
        await catalog.refresh();
        const reader = createCatalogSnapshotReader(JSON.parse(JSON.stringify(stored)));
        const snapshot = reader.snapshot();
        expect(snapshot.market).toEqual({
            ...market,
            pairs: [
                {
                    ...market.pairs[0],
                    baseAsset: market.assets[0],
                    quoteAsset: market.assets[1],
                },
            ],
        });
        const { variants, ...asset } = zipper.assets[0]!;
        expect(snapshot.zipper).toEqual({
            ...zipper,
            assets: [
                {
                    ...asset,
                    chains: [{ ...zipper.chains[0], ...variants[0] }],
                },
            ],
        });
        expect(reader.market.requirePair(10)).toMatchObject({
            baseQuantityScale: 8,
            quoteQuantityScale: 6,
        });
        zipper.polyesterChainId = 888;
        await catalog.refresh();
        expect(catalog.snapshot().zipper.polyesterChainId).toBe(888);
    });

    it("validates newly retained fields in hydrated snapshots", async () => {
        const { market, zipper } = configs();
        const catalog = createPolyesterCatalog({
            refresh: { market: async () => market, zipper: async () => zipper },
        });
        const snapshot = await catalog.refresh();
        expect(() =>
            createCatalogSnapshotReader({
                ...snapshot,
                zipper: { ...snapshot.zipper, polyesterChainId: "bad" },
            } as never),
        ).toThrow();
        expect(() =>
            createCatalogSnapshotReader({
                ...snapshot,
                market: {
                    ...snapshot.market,
                    pairs: [{ ...snapshot.market.pairs[0], baseQuantityScale: "bad" }],
                },
            } as never),
        ).toThrow();
    });
});
