import { PolyesterServerClient } from "../src/server-client.js";
import type { AssetConfig, PairConfig } from "../src/catalogs/config-types.js";
import type { EnrichedPairConfig } from "../src/catalogs/market-data-catalog.js";

const OUTPUT_PATH = new URL("../src/catalogs/market-data-catalog.generated.ts", import.meta.url);

function enrichPairs(pairs: PairConfig[], assets: AssetConfig[]): EnrichedPairConfig[] {
    const assetMap = new Map(assets.map((a) => [a.symbol, a]));
    const enriched: EnrichedPairConfig[] = [];

    for (const pair of pairs) {
        const baseAsset = assetMap.get(pair.baseAsset);
        const quoteAsset = assetMap.get(pair.quoteAsset);

        if (!baseAsset || !quoteAsset) {
            console.warn(`Skipping pair ${pair.symbol}: missing asset config`);
            continue;
        }

        enriched.push({
            symbolId: pair.symbolId,
            symbol: pair.symbol,
            baseAsset,
            quoteAsset,
            tickSize: pair.tickSize,
            stepSize: pair.stepSize,
            minNotionalQuote: pair.minNotionalQuote,
            minQtyBase: pair.minQtyBase,
            allowBuyFeeFromReceived: pair.allowBuyFeeFromReceived,
            defaultMarketSlippagePctBuy: pair.defaultMarketSlippagePctBuy,
            defaultMarketSlippagePctSell: pair.defaultMarketSlippagePctSell,
            maxClientRefDriftPct: pair.maxClientRefDriftPct,
            marketdata: pair.marketdata,
            listingAt: pair.listingAt ?? null,
            delistingAt: pair.delistingAt ?? null,
            status: pair.status,
        });
    }

    return enriched;
}

async function main(): Promise<void> {
    const client = new PolyesterServerClient();
    const spotConfig = await client.marketData.getSpotConfig();

    const enrichedPairs = enrichPairs(spotConfig.pairs, spotConfig.assets);
    const timestamp = new Date().toISOString();

    const content = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated at: ${timestamp}
// Run \`bun run scripts/generate-asset-catalog.ts\` to regenerate

import type { AssetConfig } from "./config-types.js";
import type { EnrichedPairConfig } from "./market-data-catalog.js";

export const ASSET_CATALOG: AssetConfig[] = ${JSON.stringify(spotConfig.assets, null, "\t")};

export const PAIR_CATALOG: EnrichedPairConfig[] = ${JSON.stringify(enrichedPairs, null, "\t")};
`;

    await Bun.write(OUTPUT_PATH, content);
    console.log(
        `Generated market-data-catalog.generated.ts with ${spotConfig.assets.length} assets and ${enrichedPairs.length} pairs`,
    );
}

main().catch((err) => {
    console.error("Failed to generate asset catalog:", err);
    process.exit(1);
});
