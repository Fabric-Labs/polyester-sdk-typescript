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
    const cell = options.cell;
    let local: CatalogSnapshot | undefined = undefined;
    const getCurrent = (): CatalogSnapshot | undefined => (cell ? cell.get() : local);
    const setCurrent = (snapshot: CatalogSnapshot): void => {
        if (cell) cell.set(snapshot);
        else local = snapshot;
    };
    if (options.snapshot && !getCurrent()) setCurrent(options.snapshot);

    const initial = getCurrent();
    let stateValue: CatalogState = initial
        ? { status: "fresh", source: initial.source }
        : { status: "empty" };
    let refreshInFlight: Promise<CatalogSnapshot> | undefined;

    const reader = createReader(() => {
        const current = getCurrent();
        if (!current) throw new CatalogNotReadyError();
        return current;
    });

    const currentSource = (): CatalogStateSource => getCurrent()?.source ?? "empty";

    function setSnapshot(snapshot: CatalogSnapshot): void {
        setCurrent(snapshot);
        stateValue = { status: "fresh", source: snapshot.source };
    }

    function refresh(): Promise<CatalogSnapshot> {
        if (options.refresh === false || options.refresh === undefined) {
            const current = getCurrent();
            if (!current) return Promise.reject(new CatalogNotReadyError());
            return Promise.resolve(current);
        }
        if (refreshInFlight) return refreshInFlight;

        stateValue = { status: "refreshing", previousSource: currentSource() };
        refreshInFlight = Promise.all([options.refresh.market(), options.refresh.zipper()])
            .then(([marketSeed, zipperSeed]) => {
                const snapshot = buildCatalogSnapshot({
                    market: marketSeed,
                    zipper: zipperSeed,
                    source: "api",
                    version: (getCurrent()?.version ?? 0) + 1,
                });
                setSnapshot(snapshot);
                return snapshot;
            })
            .catch((error) => {
                stateValue = { status: "stale", source: currentSource(), error };
                throw error;
            })
            .finally(() => {
                refreshInFlight = undefined;
            });

        return refreshInFlight;
    }

    function ready(): Promise<CatalogSnapshot | null> {
        const current = getCurrent();
        if (current) return Promise.resolve(current);
        if (refreshInFlight) return refreshInFlight.catch(() => getCurrent() ?? null);
        return Promise.resolve(null);
    }

    function ensureReady(): Promise<CatalogSnapshot> {
        const current = getCurrent();
        if (current) return Promise.resolve(current);
        return refreshInFlight ?? refresh();
    }

    return {
        ...reader,
        state: () => stateValue,
        ready,
        ensureReady,
        refresh,
        setSnapshot,
    };
}
