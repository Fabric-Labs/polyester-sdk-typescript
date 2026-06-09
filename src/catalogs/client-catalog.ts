import { createReader } from "./readers.js";
import { buildCatalogSnapshot } from "./snapshot.js";
import type {
    CatalogSnapshot,
    CatalogState,
    CatalogStateSource,
    ClientCatalog,
    CreatePolyesterCatalogOptions,
} from "./types.js";
import { CatalogNotReadyError } from "./types.js";

export function createPolyesterCatalog(options: CreatePolyesterCatalogOptions = {}): ClientCatalog {
    let current = options.snapshot;
    let stateValue: CatalogState = current
        ? { status: "fresh", source: current.source }
        : { status: "empty" };
    let refreshInFlight: Promise<CatalogSnapshot> | undefined;
    let readyPromise: Promise<CatalogSnapshot | null> | undefined;

    const reader = createReader(() => {
        if (!current) throw new CatalogNotReadyError();
        return current;
    });

    const currentSource = (): CatalogStateSource => current?.source ?? "empty";

    function runRefresh(): Promise<CatalogSnapshot> {
        if (options.refresh === false || options.refresh === undefined) {
            if (!current) return Promise.reject(new CatalogNotReadyError());
            return Promise.resolve(current);
        }
        if (refreshInFlight) return refreshInFlight;

        stateValue = { status: "refreshing", previousSource: currentSource() };
        refreshInFlight = Promise.all([options.refresh.market(), options.refresh.zipper()])
            .then(([marketSeed, zipperSeed]) => {
                current = buildCatalogSnapshot({
                    market: marketSeed,
                    zipper: zipperSeed,
                    source: "api",
                    version: (current?.version ?? 0) + 1,
                });
                stateValue = { status: "fresh", source: "api" };
                return current;
            })
            .catch((error) => {
                stateValue = { status: "stale", source: currentSource(), error };
                throw error;
            })
            .finally(() => {
                refreshInFlight = undefined;
            });

        readyPromise = refreshInFlight.catch(() => current ?? null);
        return refreshInFlight;
    }

    return {
        ...reader,
        state: () => stateValue,
        ready: () => readyPromise ?? Promise.resolve(current ?? null),
        refresh: () => runRefresh(),
    };
}
