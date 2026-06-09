import { POLYESTER_TESTNET_ENVIRONMENT } from "../src/environment.js";
import { PolyesterServerClient } from "../src/server-client.js";
import {
    renderMarketDataCatalogModule,
    renderZipperCatalogModule,
    validateCatalogSnapshot,
} from "../src/catalogs/catalog-codegen.js";
import { buildCatalogSnapshot } from "../src/catalogs/snapshot.js";

const MARKET_OUTPUT_PATH = new URL(
    "../src/catalogs/market-data-catalog.generated.ts",
    import.meta.url,
);
const ZIPPER_OUTPUT_PATH = new URL("../src/catalogs/zipper-catalog.generated.ts", import.meta.url);
const REQUEST_TIMEOUT_MS = 30_000;

function timeoutSignal(timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort(new Error(`catalog refresh timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    return {
        signal: controller.signal,
        dispose: () => clearTimeout(timeout),
    };
}

async function writeGeneratedFiles(params: {
    marketContent: string;
    zipperContent: string;
}): Promise<void> {
    await Promise.all([
        Bun.write(MARKET_OUTPUT_PATH, params.marketContent),
        Bun.write(ZIPPER_OUTPUT_PATH, params.zipperContent),
    ]);
}

async function main(): Promise<void> {
    const client = new PolyesterServerClient({
        environment: POLYESTER_TESTNET_ENVIRONMENT,
    });
    const { signal, dispose } = timeoutSignal(REQUEST_TIMEOUT_MS);

    try {
        const [spotConfig, zipperConfig] = await Promise.all([
            client.marketData.getSpotConfig({ signal }),
            client.zipper.getDepositWithdrawConfig({ signal }),
        ]);
        const snapshot = buildCatalogSnapshot({
            seed: {
                market: spotConfig,
                zipper: zipperConfig,
            },
            source: "api",
            version: 1,
        });
        validateCatalogSnapshot(snapshot);

        const marketContent = renderMarketDataCatalogModule(spotConfig);
        const zipperContent = renderZipperCatalogModule(zipperConfig);
        await writeGeneratedFiles({ marketContent, zipperContent });

        console.log(
            [
                `Refreshed testnet catalogs from ${POLYESTER_TESTNET_ENVIRONMENT.apiUrl}`,
                `environment=${POLYESTER_TESTNET_ENVIRONMENT.name}`,
                `fingerprint=${POLYESTER_TESTNET_ENVIRONMENT.fingerprint}`,
                `marketAssets=${snapshot.market.assets.length}`,
                `marketPairs=${snapshot.market.pairs.length}`,
                `zipperChains=${snapshot.zipper.chains.length}`,
                `zipperAssets=${snapshot.zipper.assets.length}`,
                `zipperContracts=${snapshot.zipper.contracts.length}`,
                `spotTsSec=${spotConfig.tsSec}`,
                `zipperTsMs=${zipperConfig.tsMs}`,
            ].join(" "),
        );
    } finally {
        dispose();
    }
}

main().catch((err) => {
    console.error("Failed to refresh testnet catalogs:", err);
    process.exit(1);
});
