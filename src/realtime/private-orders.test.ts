import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderSchema } from "../gen/orders/v1/orders_read_pb.js";
import {
    Channel,
    ClientMessageSchema,
    RequestError_Code,
    ServerMessageSchema,
    Unsubscribed_Reason,
    type ClientMessage,
} from "../gen/privatews/v1/private_ws_pb.js";
import { AuthenticationError, RealtimeError } from "../shared/errors.js";
import { formatId } from "../utils/base58-id.js";
import { RealtimeClient } from "./client.js";
import { PRIVATE_WS_SUBPROTOCOL, PrivateOrderStream } from "./private-orders.js";

type Frame = MessageInitShape<typeof ServerMessageSchema>["frame"];

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    readyState = 0;
    binaryType = "blob";
    sent: ClientMessage[] = [];
    closed: { code: number; reason?: string } | undefined;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;

    constructor(
        readonly url: string,
        readonly protocol: string,
    ) {
        FakeWebSocket.instances.push(this);
    }

    send(data: Uint8Array): void {
        this.sent.push(fromBinary(ClientMessageSchema, data));
    }

    close(code = 1000, reason?: string): void {
        this.readyState = 3;
        this.closed = { code, reason };
    }

    open(): void {
        this.readyState = 1;
        this.onopen?.();
    }

    receive(sub: string, seq: bigint, frame: Frame): void {
        const bytes = toBinary(
            ServerMessageSchema,
            create(ServerMessageSchema, { sub, seq, frame }),
        );
        this.onmessage?.({ data: bytes.slice().buffer });
    }

    serverClose(code: number): void {
        this.readyState = 3;
        this.onclose?.({ code, reason: "" });
    }

    ops(kind: NonNullable<ClientMessage["op"]["case"]>) {
        return this.sent.filter((msg) => msg.op.case === kind).map((msg) => msg.op.value!);
    }
}

const ACCOUNT = formatId(42n);
const flush = () => vi.advanceTimersByTimeAsync(0);
const order = (orderId: bigint) => create(OrderSchema, { orderId, symbolId: 1, version: 1 });

function setup(overrides: { fetchConnectToken?: () => Promise<string> } = {}) {
    const fetchConnectToken = vi.fn(overrides.fetchConnectToken ?? (async () => "connect-token"));
    const fetchSubscribeToken = vi.fn(async () => "sub-token");
    const stream = new PrivateOrderStream({
        url: "wss://api.test/v1/ws/private",
        fetchConnectToken,
        fetchSubscribeToken,
    });
    const handlers = {
        onEvent: vi.fn(),
        onConnected: vi.fn(),
        onDisconnected: vi.fn(),
        onError: vi.fn(),
    };
    const unsubscribe = stream.connect({ accountId: ACCOUNT, ...handlers });
    return { stream, handlers, unsubscribe, fetchConnectToken, fetchSubscribeToken };
}

/** Opens the latest socket and confirms the newest subscribe request as `sub`. */
async function confirm(sub = "s1"): Promise<FakeWebSocket> {
    const ws = FakeWebSocket.instances.at(-1)!;
    if (ws.readyState === 0) ws.open();
    await flush();
    const request = ws.ops("subscribe").at(-1) as { id: string };
    ws.receive(sub, 0n, { case: "subscribed", value: { id: request.id, account: 42n } });
    return ws;
}

describe("PrivateOrderStream", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        FakeWebSocket.instances = [];
        vi.stubGlobal("WebSocket", FakeWebSocket);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("authenticates, subscribes, and installs paged snapshots whole", async () => {
        const { handlers, fetchSubscribeToken } = setup();
        const ws = FakeWebSocket.instances[0]!;
        expect(ws.url).toBe("wss://api.test/v1/ws/private");
        expect(ws.protocol).toBe(PRIVATE_WS_SUBPROTOCOL);
        expect(ws.binaryType).toBe("arraybuffer");

        await confirm();
        expect(ws.sent[0]!.op).toMatchObject({ case: "auth", value: { token: "connect-token" } });
        expect(ws.ops("subscribe")[0]).toMatchObject({
            channel: Channel.ORDERS,
            account: 42n,
            token: "sub-token",
            cursor: "",
        });
        expect(fetchSubscribeToken).toHaveBeenCalledWith(`private:spot:orders:${ACCOUNT}`);
        expect(handlers.onConnected).toHaveBeenCalledOnce();

        ws.receive("s1", 1n, { case: "snapshotBegin", value: { epoch: 1n } });
        ws.receive("s1", 2n, { case: "snapshotPage", value: { orders: [order(1n)] } });
        ws.receive("s1", 3n, { case: "snapshotPage", value: { orders: [order(2n)] } });
        expect(handlers.onEvent).not.toHaveBeenCalled();
        ws.receive("s1", 4n, { case: "snapshotEnd", value: { cursor: "c1", count: 2 } });
        ws.receive("s1", 5n, { case: "unit", value: { nextCursor: "c2", orders: [order(1n)] } });
        ws.receive("s1", 6n, { case: "unavailable", value: {} });
        ws.receive("s1", 7n, { case: "available", value: {} });

        expect(handlers.onEvent.mock.calls.map(([event]) => event.type)).toEqual([
            "snapshot",
            "unit",
            "stale",
            "stale",
        ]);
        expect(
            handlers.onEvent.mock.calls[0]![0].orders.map((o: { orderId: bigint }) => o.orderId),
        ).toEqual([1n, 2n]);
        expect(handlers.onEvent.mock.calls.slice(2).map(([event]) => event.stale)).toEqual([
            true,
            false,
        ]);
        expect(handlers.onError).not.toHaveBeenCalled();
    });

    it("resubscribes from the last applied cursor after a sequence gap", async () => {
        const { handlers } = setup();
        const ws = await confirm();
        ws.receive("s1", 1n, { case: "snapshotBegin", value: {} });
        ws.receive("s1", 2n, { case: "snapshotEnd", value: { cursor: "c1", count: 0 } });
        ws.receive("s1", 4n, { case: "unit", value: { nextCursor: "c9", orders: [order(1n)] } });
        await flush();

        expect(ws.ops("unsubscribe")).toEqual([expect.objectContaining({ sub: "s1" })]);
        expect(ws.ops("subscribe").at(-1)).toMatchObject({ cursor: "c1" });
        expect(handlers.onEvent.mock.calls.map(([event]) => event.type)).toEqual(["snapshot"]);

        // Frames for the dropped subscription are ignored.
        ws.receive("s1", 5n, { case: "unit", value: { nextCursor: "c10" } });
        expect(handlers.onEvent).toHaveBeenCalledOnce();
    });

    it("rejects a snapshot whose pages disagree with its count and takes a fresh one", async () => {
        const { handlers } = setup();
        const ws = await confirm();
        ws.receive("s1", 1n, { case: "snapshotBegin", value: {} });
        ws.receive("s1", 2n, { case: "snapshotPage", value: { orders: [order(1n)] } });
        ws.receive("s1", 3n, { case: "snapshotEnd", value: { cursor: "c1", count: 2 } });
        await flush();

        expect(handlers.onEvent).not.toHaveBeenCalled();
        expect(ws.ops("subscribe").at(-1)).toMatchObject({ cursor: "" });
    });

    it("refreshes expiring tokens and resubscribes when a subscription token lapses", async () => {
        const { fetchConnectToken } = setup();
        const ws = await confirm();
        ws.receive("s1", 1n, { case: "snapshotBegin", value: {} });
        ws.receive("s1", 2n, { case: "snapshotEnd", value: { cursor: "c1", count: 0 } });

        ws.receive("", 0n, { case: "tokenExpiring", value: { expiresTsSec: 1n } });
        ws.receive("s1", 0n, { case: "subscribeExpiring", value: { expiresTsSec: 1n } });
        await flush();
        expect(fetchConnectToken).toHaveBeenCalledTimes(2);
        expect(ws.ops("auth")).toHaveLength(2);
        expect(ws.ops("subscribeRefresh")).toEqual([
            expect.objectContaining({ sub: "s1", token: "sub-token" }),
        ]);

        ws.receive("s1", 0n, {
            case: "unsubscribed",
            value: { reason: Unsubscribed_Reason.TOKEN_EXPIRED },
        });
        await flush();
        expect(ws.ops("subscribe")).toHaveLength(2);
        expect(ws.ops("subscribe").at(-1)).toMatchObject({ cursor: "c1" });
    });

    it("reconnects with backoff and resumes from the last cursor", async () => {
        const { handlers } = setup();
        const first = await confirm();
        first.receive("s1", 1n, { case: "snapshotBegin", value: {} });
        first.receive("s1", 2n, { case: "snapshotEnd", value: { cursor: "c1", count: 0 } });

        first.serverClose(1001);
        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
        const [{ error }] = handlers.onError.mock.calls.at(-1)!;
        expect(error).toBeInstanceOf(RealtimeError);
        expect(error).toMatchObject({ realtimeCode: 1001, retryable: true });

        // The first retry waits 250-500 ms: half the 500 ms base plus jitter.
        await vi.advanceTimersByTimeAsync(249);
        expect(FakeWebSocket.instances).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(251);
        expect(FakeWebSocket.instances).toHaveLength(2);

        const second = await confirm("s2");
        expect(second.ops("subscribe")).toEqual([expect.objectContaining({ cursor: "c1" })]);
        expect(handlers.onConnected).toHaveBeenCalledTimes(2);
        second.receive("s2", 1n, { case: "unit", value: { nextCursor: "c2" } });
        expect(handlers.onEvent).toHaveBeenCalledTimes(2);
    });

    it("drops a connection that sends nothing for 3 seconds", async () => {
        setup();
        const ws = await confirm();
        await vi.advanceTimersByTimeAsync(2_999);
        ws.receive("", 0n, { case: "heartbeat", value: { serverTsNs: 1n } });
        await vi.advanceTimersByTimeAsync(2_999);
        expect(ws.closed).toBeUndefined();

        await vi.advanceTimersByTimeAsync(1);
        expect(ws.closed).toMatchObject({ code: 4000 });
        await vi.advanceTimersByTimeAsync(500);
        expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it("retries an unreadable cursor fresh and ends a forbidden subscription", async () => {
        const { handlers } = setup();
        const ws = FakeWebSocket.instances[0]!;
        ws.open();
        await flush();
        const first = ws.ops("subscribe")[0] as { id: string };
        ws.receive("", 0n, {
            case: "error",
            value: { id: first.id, code: RequestError_Code.CURSOR_INVALID },
        });
        await flush();
        const second = ws.ops("subscribe")[1] as { id: string; cursor: string };
        expect(second.cursor).toBe("");

        ws.receive("", 0n, {
            case: "error",
            value: { id: second.id, code: RequestError_Code.FORBIDDEN, message: "forbidden" },
        });

        expect(handlers.onError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "subscribe", error: expect.any(RealtimeError) }),
        );
        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
        expect(ws.closed).toMatchObject({ code: 1000 });
    });

    it("stops on a non-retryable connect token failure", async () => {
        const { handlers } = setup({
            fetchConnectToken: async () => {
                throw new AuthenticationError("signed out");
            },
        });
        FakeWebSocket.instances[0]!.open();
        await flush();
        await vi.advanceTimersByTimeAsync(20_000);

        expect(handlers.onError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "connection_token" }),
        );
        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it("unsubscribes on the server and closes the idle connection", async () => {
        const { unsubscribe } = setup();
        const ws = await confirm();
        unsubscribe();

        expect(ws.ops("unsubscribe")).toEqual([expect.objectContaining({ sub: "s1" })]);
        expect(ws.closed).toMatchObject({ code: 1000 });
    });
});

describe("RealtimeClient.connectPrivateOrders", () => {
    beforeEach(() => {
        FakeWebSocket.instances = [];
        vi.stubGlobal("WebSocket", FakeWebSocket);
    });

    afterEach(() => vi.unstubAllGlobals());

    it("fetches tokens for the order channel without the retired :proto suffix", async () => {
        const fetchMock = vi.fn(async (_url: URL | string) => Response.json({ token: "token" }));
        vi.stubGlobal("fetch", fetchMock);
        const client = new RealtimeClient({
            wsUrl: "wss://api.test",
            tokenEndpoint: "https://api.test/v1/rt/token",
            subscribeEndpoint: "https://api.test/v1/rt/subscribe",
            privateWsUrl: "wss://api.test/v1/ws/private",
            hasAuth: () => true,
        });

        const stop = client.connectPrivateOrders({ accountId: ACCOUNT, onEvent: vi.fn() });
        await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
        const ws = FakeWebSocket.instances[0]!;
        ws.open();
        await vi.waitFor(() => expect(ws.ops("subscribe")).toHaveLength(1));

        expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
            "https://api.test/v1/rt/token",
            `https://api.test/v1/rt/subscribe?channel=private%3Aspot%3Aorders%3A${ACCOUNT}`,
        ]);
        stop();
        expect(ws.closed).toMatchObject({ code: 1000 });
    });

    it("reports missing authentication without opening a socket", async () => {
        const client = new RealtimeClient({
            wsUrl: "wss://api.test",
            tokenEndpoint: "https://api.test/v1/rt/token",
            subscribeEndpoint: "https://api.test/v1/rt/subscribe",
            privateWsUrl: "wss://api.test/v1/ws/private",
        });
        const onError = vi.fn();

        client.connectPrivateOrders({ accountId: ACCOUNT, onEvent: vi.fn(), onError });
        await Promise.resolve();

        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "auth", error: expect.any(AuthenticationError) }),
        );
        expect(() => client.connectPrivateOrders({ accountId: ACCOUNT, onEvent: vi.fn() })).toThrow(
            AuthenticationError,
        );
        expect(FakeWebSocket.instances).toHaveLength(0);
    });
});
