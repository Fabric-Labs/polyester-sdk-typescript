import { PolyesterServerClient } from "../src/server-client.js";
import { enrichZipperAssets } from "../src/catalogs/zipper-catalog.js";

const OUTPUT_PATH = new URL("../src/catalogs/zipper-catalog.generated.ts", import.meta.url);

async function main(): Promise<void> {
    const client = new PolyesterServerClient();
    const config = await client.zipper.getDepositWithdrawConfig();
    const enrichedAssets = enrichZipperAssets(config.assets, config.chains);
    const contractNames = config.contracts.map((contract) => contract.name);
    const timestamp = new Date().toISOString();

    const content = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated at: ${timestamp}
// Run \`bun run scripts/generate-zipper-catalog.ts\` to regenerate

import type { ZipperEnrichedAssetConfig, ZipperChainConfig, ZipperChainContractConfig } from "./zipper-catalog.js";

export const ZIPPER_CHAIN_CATALOG: ZipperChainConfig[] = ${JSON.stringify(config.chains, null, "\t")};

export const ZIPPER_ASSET_CATALOG: ZipperEnrichedAssetConfig[] = ${JSON.stringify(enrichedAssets, null, "\t")};

export const ZIPPER_CONTRACTS_CATALOG: ZipperChainContractConfig[] = ${JSON.stringify(config.contracts, null, "\t")};

export const ZIPPER_CONTRACT_NAMES = ${JSON.stringify(contractNames, null, "\t")} as const;

export type ZipperContractName = (typeof ZIPPER_CONTRACT_NAMES)[number];
`;

    await Bun.write(OUTPUT_PATH, content);
    console.log(
        `Generated zipper-catalog.generated.ts with ${config.chains.length} chains, ${enrichedAssets.length} assets, and ${config.contracts.length} contracts`,
    );
}

main().catch((err) => {
    console.error("Failed to generate zipper catalog:", err);
    process.exit(1);
});
