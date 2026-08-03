import type { SubscriptionErrorContext as CentrifugeSubscriptionErrorContext } from "centrifuge/build/protobuf";

export type SdkSubscriptionErrorDetails = {
    code: number;
    message: string;
};

export type SdkSubscriptionErrorContext = {
    channel: string;
    type: string;
    error: Error | SdkSubscriptionErrorDetails;
};

export function createSdkSubscriptionErrorContext(
    channel: string,
    type: string,
    error: unknown,
): SdkSubscriptionErrorContext {
    if (error instanceof Error) {
        return { channel, type, error };
    }
    if (typeof error === "string") {
        return { channel, type, error: { code: 0, message: error } };
    }
    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
    ) {
        const details = error as SdkSubscriptionErrorDetails;
        return {
            channel,
            type,
            error: {
                code: details.code ?? 0,
                message: details.message,
            },
        };
    }
    return {
        channel,
        type,
        error: { code: 0, message: "Unknown realtime subscription error" },
    };
}

export function publicationHandlerErrorContext(
    channel: string,
    error: unknown,
): SdkSubscriptionErrorContext {
    return createSdkSubscriptionErrorContext(channel, "publication_handler", error);
}

export function fromCentrifugeSubscriptionError(
    ctx: CentrifugeSubscriptionErrorContext,
): SdkSubscriptionErrorContext {
    return {
        channel: ctx.channel,
        type: ctx.type,
        error: ctx.error,
    };
}
