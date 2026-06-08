import { createReader } from "./readers.js";
import { buildCatalogSnapshot, buildGeneratedCatalogSnapshot, generatedSeed } from "./snapshot.js";
import type {
    CatalogReader,
    CatalogSnapshot,
    CatalogState,
    ClientCatalog,
    CreatePolyesterCatalogOptions,
} from "./types.js";

export function createPolyesterCatalog(options: CreatePolyesterCatalogOptions = {}): ClientCatalog {
    const initialSource: CatalogSnapshot["source"] =
        options.source ?? (options.seed ? "custom" : "generated");
    let current = buildCatalogSnapshot({
        seed: {
            market: options.seed?.market ?? generatedSeed.market,
            zipper: options.seed?.zipper ?? generatedSeed.zipper,
        },
        source: initialSource,
        version: 1,
    });
    let stateValue: CatalogState =
        initialSource === "generated"
            ? { status: "generated" }
            : { status: "fresh", source: "custom" };
    let refreshInFlight: Promise<CatalogSnapshot> | undefined;
    let readyPromise: Promise<CatalogSnapshot> | undefined;

    const reader = createReader(() => current);

    function runRefresh(): Promise<CatalogSnapshot> {
        if (options.refresh === false || options.refresh === undefined) {
            return Promise.resolve(current);
        }
        if (refreshInFlight) return refreshInFlight;

        stateValue = { status: "refreshing", previousSource: current.source };
        refreshInFlight = Promise.all([options.refresh.market(), options.refresh.zipper()])
            .then(([marketSeed, zipperSeed]) => {
                current = buildCatalogSnapshot({
                    seed: { market: marketSeed, zipper: zipperSeed },
                    source: "api",
                    version: current.version + 1,
                });
                stateValue = { status: "fresh", source: "api" };
                return current;
            })
            .catch((error) => {
                stateValue = { status: "stale", source: current.source, error };
                throw error;
            })
            .finally(() => {
                refreshInFlight = undefined;
            });

        readyPromise = refreshInFlight.catch(() => current);
        return refreshInFlight;
    }

    return {
        ...reader,
        state: () => stateValue,
        ready: () => readyPromise ?? Promise.resolve(current),
        refresh: () => runRefresh(),
    };
}

const generatedSnapshot = buildGeneratedCatalogSnapshot();
export const staticCatalog: CatalogReader = createReader(() => generatedSnapshot);
