import { PolyesterServerClient } from "../src/server-client.js";
import { POLYESTER_TESTNET_ENVIRONMENT } from "../src/environment.js";
import { buildMarketCatalogData } from "../src/catalogs/market-data-catalog.js";

const OUTPUT_PATH = new URL("../src/catalogs/market-data-catalog.generated.ts", import.meta.url);

async function main(): Promise<void> {
    const client = new PolyesterServerClient({
        environment: POLYESTER_TESTNET_ENVIRONMENT,
        refreshCatalogs: false,
    });
    const spotConfig = await client.marketData.getSpotConfig();

    const catalogData = buildMarketCatalogData(spotConfig);

    const content = `// AUTO-GENERATED FILE - DO NOT EDIT
// Run \`bun run scripts/generate-asset-catalog.ts\` to regenerate

import type { AssetConfig } from "./config-types.js";
import type { EnrichedPairConfig } from "./market-data-catalog.js";

export const ASSET_CATALOG: AssetConfig[] = ${JSON.stringify(catalogData.assets, null, 4)};

export const PAIR_CATALOG: EnrichedPairConfig[] = ${JSON.stringify(catalogData.pairs, null, 4)};
`;

    await Bun.write(OUTPUT_PATH, content);
    console.log(
        `Generated market-data-catalog.generated.ts with ${catalogData.assets.length} assets and ${catalogData.pairs.length} pairs`,
    );
}

main().catch((err) => {
    console.error("Failed to generate asset catalog:", err);
    process.exit(1);
});
