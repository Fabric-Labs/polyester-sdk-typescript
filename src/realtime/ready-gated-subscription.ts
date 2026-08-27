import type { DescMessage } from "@bufbuild/protobuf";
import { createReadyGate } from "../shared/decimal-surface.js";
import { publicationHandlerErrorContext } from "../shared/subscription-errors.js";
import type { ConnectChannelParams, PolyesterRealtime } from "./types.js";

type ReadyGatedProtoChannelParams<TSchema extends DescMessage> = ConnectChannelParams<TSchema> & {
    ready: () => Promise<void>;
};

/**
 * Connects a transition feed whose publications require asynchronous catalog
 * readiness. If readiness fails or its bounded pre-ready queue overflows, the
 * consumer is unsubscribed after receiving one error and one close callback;
 * continuing after a dropped transition would expose incomplete state.
 */
export function connectReadyGatedProtoChannel<TSchema extends DescMessage>(
    realtime: PolyesterRealtime,
    params: ReadyGatedProtoChannelParams<TSchema>,
): () => void {
    let unsubscribeRealtime: (() => void) | undefined;
    let unsubscribeAfterConnect = false;
    let state: "active" | "terminal" | "disposed" = "active";
    let terminalCloseNotified = false;

    function reportPublicationError(error: unknown): void {
        try {
            params.onError?.(publicationHandlerErrorContext(params.channel, error));
        } catch {
            // Keep consumer error-handler failures isolated from subscription teardown.
        }
    }

    function notifyTerminalClose(): void {
        if (terminalCloseNotified) return;
        terminalCloseNotified = true;
        try {
            params.onDisconnected?.();
        } catch {
            // Keep consumer close-handler failures isolated from subscription teardown.
        }
    }

    function terminate(error: unknown): void {
        if (state !== "active") return;
        state = "terminal";
        reportPublicationError(error);

        if (unsubscribeRealtime) unsubscribeRealtime();
        else unsubscribeAfterConnect = true;
        notifyTerminalClose();
    }

    const gate = createReadyGate(params.ready, {
        onDeliveryError: reportPublicationError,
        onTerminalError: terminate,
    });

    try {
        unsubscribeRealtime = realtime.connectProtoChannel({
            channel: params.channel,
            schema: params.schema,
            onPublication: (data) => gate.run(() => params.onPublication(data)),
            onConnected: () => {
                if (state === "active") params.onConnected?.();
            },
            onDisconnected: () => {
                if (state === "terminal") notifyTerminalClose();
                else if (state === "active") params.onDisconnected?.();
            },
            onError: params.onError,
        });
    } catch (error) {
        gate.close();
        throw error;
    }

    if (unsubscribeAfterConnect) unsubscribeRealtime();

    return () => {
        if (state !== "active") return;
        state = "disposed";
        gate.close();
        unsubscribeRealtime?.();
    };
}
