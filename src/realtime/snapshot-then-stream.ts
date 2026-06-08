import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import type { SubscriptionErrorContext } from "centrifuge/build/protobuf";
import type { RealtimeClient } from "./client.js";
import { formatConnectError } from "../utils/errors.js";
import { isDev } from "../utils/is-dev.js";

export interface SnapshotThenStreamSubscription {
    unsubscribe: () => void;
    refreshSnapshot: () => void;
    isReady: () => boolean;
    isDisposed: () => boolean;
}

export interface SnapshotThenStreamInput<TSchema extends DescMessage, TSnapshot, TPublication> {
    realtime: RealtimeClient;
    channel: string;
    schema: TSchema;
    maxBufferedPublications?: number;
    snapshotErrorLog?: string;
    fetchSnapshot: () => Promise<TSnapshot>;
    readPublication: (message: MessageShape<TSchema>) => readonly TPublication[];
    applySnapshot: (snapshot: TSnapshot, bufferedPublications: readonly TPublication[]) => void;
    applyLivePublications: (publications: readonly TPublication[]) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (ctx: SubscriptionErrorContext) => void;
}

export function snapshotThenStream<TSchema extends DescMessage, TSnapshot, TPublication>(
    params: SnapshotThenStreamInput<TSchema, TSnapshot, TPublication>,
): SnapshotThenStreamSubscription {
    const maxBufferedPublications = params.maxBufferedPublications ?? 200;

    let ready = false;
    let disposed = false;
    let refreshGeneration = 0;
    let pendingPublications: TPublication[] = [];

    function reportSnapshotError(error: unknown): void {
        if (isDev() && params.snapshotErrorLog) {
            console.error(params.snapshotErrorLog, error);
        }
        params.onError?.({
            channel: params.channel,
            type: "snapshot",
            error: {
                code: 0,
                message: formatConnectError(error, "snapshot failed"),
            },
        });
    }

    function takePendingPublications(): TPublication[] {
        const buffered = pendingPublications;
        pendingPublications = [];
        return buffered;
    }

    function applyBufferedAsLive(): void {
        const buffered = takePendingPublications();
        if (buffered.length === 0) return;
        params.applyLivePublications(buffered);
    }

    function refreshSnapshot(): void {
        const generation = ++refreshGeneration;
        ready = false;
        pendingPublications = [];

        params
            .fetchSnapshot()
            .then((snapshot) => {
                if (disposed || generation !== refreshGeneration) return;

                const buffered = takePendingPublications();
                params.applySnapshot(snapshot, buffered);

                if (disposed || generation !== refreshGeneration) return;
                ready = true;
            })
            .catch((error: unknown) => {
                if (disposed || generation !== refreshGeneration) return;
                reportSnapshotError(error);
            });
    }

    refreshSnapshot();

    const unsubscribeRealtime = params.realtime.connectProtoChannel({
        channel: params.channel,
        schema: params.schema,
        onPublication: (message) => {
            const publications = params.readPublication(message);
            if (publications.length === 0) return;

            if (!ready) {
                pendingPublications = pendingPublications
                    .concat(publications)
                    .slice(-maxBufferedPublications);
                return;
            }

            params.applyLivePublications(publications);
        },
        onConnected: () => {
            params.onOpen?.();
            if (ready && pendingPublications.length > 0) {
                applyBufferedAsLive();
            }
        },
        onDisconnected: () => {
            if (disposed) return;
            params.onClose?.();
            refreshSnapshot();
        },
        onError: (ctx) => params.onError?.(ctx),
    });

    function unsubscribe(): void {
        disposed = true;
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
