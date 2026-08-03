import type { MessageInitShape } from "@bufbuild/protobuf";
import type { Transport } from "@connectrpc/connect";
import { vi } from "vitest";
import type { RealtimeClient } from "../realtime/client.js";
import type { SubaccountResolver } from "../services/subaccount-resolver.js";

type UnaryResponseMessage = Record<string, unknown>;
type UnaryArgs = Parameters<Transport["unary"]>;

export interface CapturedUnaryCall {
    method: UnaryArgs[0];
    signal: AbortSignal | undefined;
    timeoutMs: number | undefined;
    headers: HeadersInit | undefined;
    message: MessageInitShape<UnaryArgs[0]["input"]>;
}

type UnaryTransportHarness = {
    transport: Transport;
    unary: ReturnType<typeof vi.fn>;
    calls: CapturedUnaryCall[];
    lastCall: () => CapturedUnaryCall | undefined;
};

function unaryResponse(message: UnaryResponseMessage) {
    return {
        message,
        header: new Headers(),
        trailer: new Headers(),
        stream: false,
        service: undefined,
        method: undefined,
    };
}

/**
 * Runs the unary transport helper.
 */
export function unaryTransport(
    response:
        | UnaryResponseMessage
        | ((
              call: CapturedUnaryCall,
              index: number,
          ) => UnaryResponseMessage | Promise<UnaryResponseMessage>),
): UnaryTransportHarness {
    const calls: CapturedUnaryCall[] = [];
    const unary = vi.fn(async (...args: UnaryArgs) => {
        const call: CapturedUnaryCall = {
            method: args[0],
            signal: args[1],
            timeoutMs: args[2],
            headers: args[3],
            message: args[4],
        };
        calls.push(call);
        const message =
            typeof response === "function" ? await response(call, calls.length - 1) : response;
        return unaryResponse(message);
    });

    return {
        transport: {
            unary,
            stream: vi.fn(),
        } as unknown as Transport,
        unary,
        calls,
        lastCall: () => calls.at(-1),
    };
}

/**
 * Runs the unary transport helper with ordered response messages.
 */
export function unaryTransportSequence(responses: UnaryResponseMessage[]): UnaryTransportHarness {
    return unaryTransport((_call, index) => responses[index] ?? {});
}

/**
 * Runs the unary transport helper with responses keyed by RPC method localName.
 */
export function unaryTransportByMethod(
    responses: Record<string, UnaryResponseMessage>,
): UnaryTransportHarness {
    return unaryTransport((call) => responses[call.method.localName] ?? {});
}

/**
 * Runs the rejecting unary transport helper.
 */
export function rejectingUnaryTransport(error: unknown): Transport {
    return {
        unary: vi.fn(async () => {
            throw error;
        }),
        stream: vi.fn(),
    } as unknown as Transport;
}

/**
 * Runs the realtime client stub helper.
 */
export function realtimeClientStub(): {
    realtime: RealtimeClient;
    connectProtoChannel: ReturnType<typeof vi.fn>;
    params: Parameters<RealtimeClient["connectProtoChannel"]>[0] | undefined;
    unsubscribe: ReturnType<typeof vi.fn>;
} {
    let params: Parameters<RealtimeClient["connectProtoChannel"]>[0] | undefined;
    const unsubscribe = vi.fn();
    const connectProtoChannel = vi.fn(
        (nextParams: Parameters<RealtimeClient["connectProtoChannel"]>[0]) => {
            params = nextParams;
            return unsubscribe;
        },
    );

    return {
        realtime: {
            connectProtoChannel,
        } as unknown as RealtimeClient,
        connectProtoChannel,
        get params() {
            return params;
        },
        unsubscribe,
    };
}

/**
 * Runs the subaccount resolver stub helper.
 */
export function subaccountResolverStub(defaultSubaccountId: string | null): SubaccountResolver {
    return {
        getDefaultSubaccountId: vi.fn(() => defaultSubaccountId),
    };
}
