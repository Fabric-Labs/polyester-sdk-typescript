import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import {
    createSdkSubscriptionErrorContext,
    type SdkSubscriptionErrorContext,
} from "../shared/subscription-errors.js";
import type { PolyesterRealtime } from "./types.js";
import { formatConnectError } from "../utils/errors.js";
import { isDev } from "../utils/is-dev.js";

export interface SnapshotThenStreamSubscription {
    unsubscribe: () => void;
    refreshSnapshot: () => void;
    isReady: () => boolean;
    isDisposed: () => boolean;
}

export interface SnapshotThenStreamInput<TSchema extends DescMessage, TSnapshot, TPublication> {
    realtime: PolyesterRealtime;
    channel: string;
    schema: TSchema;
    maxBufferedPublications?: number;
    bufferPublicationKey?: (publication: TPublication) => PropertyKey;
    snapshotRetry?: {
        maxAttempts: number;
        delayMs: number;
    };
    snapshotFailureMode?: "wait" | "live" | ((error: unknown) => "wait" | "live");
    snapshotErrorLog?: string;
    fetchSnapshot: () => Promise<TSnapshot>;
    readPublication: (message: MessageShape<TSchema>) => readonly TPublication[];
    applySnapshot: (snapshot: TSnapshot, bufferedPublications: readonly TPublication[]) => void;
    applyLivePublications: (publications: readonly TPublication[]) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (ctx: SdkSubscriptionErrorContext) => void;
}

/**
 * Snapshot-then-stream for feed state. By default, the buffer caps at
 * `maxBufferedPublications` and drops the OLDEST publications, which is correct for
 * ephemeral feeds where a later publication supersedes earlier ones. Keyed state can
 * provide `bufferPublicationKey` to retain the latest value for every key without FIFO
 * loss. Entity transitions (orders, triggers, balances, trades) must NOT use this —
 * their ordering contract lives in the app-side `EntityStreamStore`, which buffers
 * unbounded and replays because dropping an event loses a row transition.
 */
export function snapshotThenStream<TSchema extends DescMessage, TSnapshot, TPublication>(
    params: SnapshotThenStreamInput<TSchema, TSnapshot, TPublication>,
): SnapshotThenStreamSubscription {
    const maxBufferedPublications = params.maxBufferedPublications ?? 200;
    let droppedPublications = 0;

    let ready = false;
    let disposed = false;
    let refreshGeneration = 0;
    let pendingPublications: TPublication[] = [];
    let retryAttempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function reportSnapshotError(error: unknown): void {
        if (isDev() && params.snapshotErrorLog) {
            console.error(params.snapshotErrorLog, error);
        }
        params.onError?.(
            createSdkSubscriptionErrorContext(
                params.channel,
                "snapshot",
                formatConnectError(error, "snapshot failed"),
            ),
        );
    }

    function takePendingPublications(): TPublication[] {
        const buffered = pendingPublications;
        pendingPublications = [];
        return buffered;
    }

    function applyBufferedAsLive(): void {
        const buffered = takePendingPublications();
        if (buffered.length === 0) return;
        applyLivePublications(buffered);
    }

    function bufferPublications(publications: readonly TPublication[]): void {
        if (params.bufferPublicationKey) {
            const byKey = new Map<PropertyKey, TPublication>();
            for (const publication of pendingPublications) {
                byKey.set(params.bufferPublicationKey(publication), publication);
            }
            for (const publication of publications) {
                byKey.set(params.bufferPublicationKey(publication), publication);
            }
            pendingPublications = Array.from(byKey.values());
            return;
        }

        const next = pendingPublications.concat(publications);
        if (next.length > maxBufferedPublications) {
            droppedPublications += next.length - maxBufferedPublications;
            if (isDev()) {
                console.warn(
                    `[snapshot-then-stream] ${params.channel}: buffer cap dropped ${droppedPublications} publication(s) while snapshot in flight`,
                );
            }
        }
        pendingPublications = next.slice(-maxBufferedPublications);
    }

    function clearRetryTimer(): void {
        if (retryTimer === null) return;
        clearTimeout(retryTimer);
        retryTimer = null;
    }

    function reportBufferedPublicationError(error: unknown): void {
        params.onError?.(
            createSdkSubscriptionErrorContext(params.channel, "publication_handler", error),
        );
    }

    function applyLivePublications(publications: readonly TPublication[]): void {
        try {
            params.applyLivePublications(publications);
        } catch (error) {
            reportBufferedPublicationError(error);
        }
    }

    function applySnapshot(
        snapshot: TSnapshot,
        bufferedPublications: readonly TPublication[],
    ): void {
        try {
            params.applySnapshot(snapshot, bufferedPublications);
        } catch (error) {
            reportBufferedPublicationError(error);
        }
    }

    function scheduleSnapshotRetry(): void {
        const retry = params.snapshotRetry;
        if (!retry || retryAttempts >= retry.maxAttempts || disposed) return;

        const delayMs = retry.delayMs * 2 ** retryAttempts;
        retryAttempts++;
        retryTimer = setTimeout(() => {
            retryTimer = null;
            refreshSnapshot(false);
        }, delayMs);
    }

    function refreshSnapshot(resetRetries = true): void {
        if (disposed) return;
        clearRetryTimer();
        if (resetRetries) retryAttempts = 0;

        const generation = ++refreshGeneration;
        ready = false;

        Promise.resolve()
            .then(() => params.fetchSnapshot())
            .then((snapshot) => {
                if (disposed || generation !== refreshGeneration) return;

                const buffered = takePendingPublications();
                applySnapshot(snapshot, buffered);

                if (disposed || generation !== refreshGeneration) return;
                ready = true;
                retryAttempts = 0;
            })
            .catch((error: unknown) => {
                if (disposed || generation !== refreshGeneration) return;
                reportSnapshotError(error);
                const failureMode =
                    typeof params.snapshotFailureMode === "function"
                        ? params.snapshotFailureMode(error)
                        : params.snapshotFailureMode;
                if (failureMode === "live") {
                    ready = true;
                    applyBufferedAsLive();
                }
                scheduleSnapshotRetry();
            });
    }

    const unsubscribeRealtime = params.realtime.connectProtoChannel({
        channel: params.channel,
        schema: params.schema,
        onPublication: (message) => {
            const publications = params.readPublication(message);
            if (publications.length === 0) return;

            if (!ready) {
                bufferPublications(publications);
                return;
            }

            applyLivePublications(publications);
        },
        onConnected: () => {
            if (disposed) return;
            pendingPublications = [];
            refreshSnapshot();
            params.onOpen?.();
        },
        onDisconnected: () => {
            if (disposed) return;
            clearRetryTimer();
            refreshGeneration++;
            ready = false;
            pendingPublications = [];
            params.onClose?.();
        },
        onError: params.onError,
    });

    function unsubscribe(): void {
        disposed = true;
        clearRetryTimer();
        refreshGeneration++;
        pendingPublications = [];
        try {
            unsubscribeRealtime();
        } catch {
            // noop
        }
    }

    return {
        unsubscribe,
        refreshSnapshot,
        isReady: () => ready,
        isDisposed: () => disposed,
    };
}
