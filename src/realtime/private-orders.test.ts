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
import { AuthenticationError, NetworkError, RealtimeError } from "../shared/errors.js";
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
const OTHER_ACCOUNT = formatId(43n);
const flush = () => vi.advanceTimersByTimeAsync(0);
const order = (orderId: bigint) => create(OrderSchema, { orderId, symbolId: 1, version: 1 });

function setup(
    overrides: {
        fetchConnectToken?: () => Promise<string>;
        fetchSubscribeToken?: (channel: string) => Promise<string>;
    } = {},
) {
    const fetchConnectToken = vi.fn(overrides.fetchConnectToken ?? (async () => "connect-token"));
    const fetchSubscribeToken = vi.fn(overrides.fetchSubscribeToken ?? (async () => "sub-token"));
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

function subscriber(stream: PrivateOrderStream, accountId = ACCOUNT) {
    const handlers = {
        onEvent: vi.fn(),
        onConnected: vi.fn(),
        onDisconnected: vi.fn(),
        onError: vi.fn(),
    };
    const unsubscribe = stream.connect({ accountId, ...handlers });
    return { handlers, unsubscribe };
}

function snapshot(ws: FakeWebSocket, sub: string, cursor: string, orders = [order(1n)]): void {
    ws.receive(sub, 1n, { case: "snapshotBegin", value: {} });
    ws.receive(sub, 2n, { case: "snapshotPage", value: { orders } });
    ws.receive(sub, 3n, { case: "snapshotEnd", value: { cursor, count: orders.length } });
}

/** Opens every socket that has not opened yet, then lets token fetches settle. */
async function openAll(): Promise<void> {
    await flush();
    for (const ws of FakeWebSocket.instances) if (ws.readyState === 0) ws.open();
    await flush();
}

/** Opens the latest socket and confirms the newest subscribe request as `sub`. */
async function confirm(sub = "s1"): Promise<FakeWebSocket> {
    await flush();
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
        vi.restoreAllMocks();
    });

    it("authenticates, subscribes, and installs paged snapshots whole", async () => {
        const { handlers, fetchSubscribeToken } = setup();
        await flush();
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

        // The first retry waits 0.5-1 s: the 500 ms base plus jitter.
        await vi.advanceTimersByTimeAsync(499);
        expect(FakeWebSocket.instances).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(501);
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
        await vi.advanceTimersByTimeAsync(1_000);
        expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it("retries an unreadable cursor fresh and ends a forbidden subscription", async () => {
        const { handlers } = setup();
        await flush();
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
        await flush();
        await vi.advanceTimersByTimeAsync(20_000);

        expect(handlers.onError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "connection_token" }),
        );
        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
        expect(FakeWebSocket.instances).toHaveLength(0);
    });

    it("unsubscribes on the server and closes the idle connection", async () => {
        const { unsubscribe } = setup();
        const ws = await confirm();
        unsubscribe();
        await flush();

        expect(ws.ops("unsubscribe")).toEqual([expect.objectContaining({ sub: "s1" })]);
        expect(ws.closed).toMatchObject({ code: 1000 });
    });

    it("unsubscribes a subscription the server confirms after its consumer left", async () => {
        const { stream } = setup();
        const ws = await confirm("s1");
        const late = subscriber(stream, OTHER_ACCOUNT);
        await flush();
        const request = ws.ops("subscribe").at(-1) as { id: string };
        late.unsubscribe();
        await flush();

        ws.receive("s2", 0n, { case: "subscribed", value: { id: request.id, account: 42n } });

        expect(ws.ops("unsubscribe")).toEqual([expect.objectContaining({ sub: "s2" })]);
        expect(late.handlers.onConnected).not.toHaveBeenCalled();
    });

    it("does not refresh or revive a subscription removed while its token was loading", async () => {
        let resolveRefresh: (token: string) => void = () => {};
        const { stream, fetchSubscribeToken } = setup();
        const ws = await confirm("s1");
        const other = subscriber(stream, OTHER_ACCOUNT);
        await confirm("s2");
        fetchSubscribeToken.mockImplementationOnce(
            () => new Promise<string>((resolve) => (resolveRefresh = resolve)),
        );

        ws.receive("s2", 0n, { case: "subscribeExpiring", value: { expiresTsSec: 1n } });
        await flush();
        other.unsubscribe();
        resolveRefresh("late-token");
        await flush();

        expect(ws.ops("subscribeRefresh")).toEqual([]);
        expect(ws.ops("subscribe")).toHaveLength(2);
    });

    it("clears a stale view when a replacement subscription starts", async () => {
        const { handlers } = setup();
        const first = await confirm("s1");
        first.receive("s1", 1n, { case: "unavailable", value: {} });
        first.serverClose(1001);
        await vi.advanceTimersByTimeAsync(10_000);
        await confirm("s2");

        expect(
            handlers.onEvent.mock.calls
                .map(([event]) => event)
                .filter((event) => event.type === "stale")
                .map((event) => event.stale),
        ).toEqual([true, false]);
    });

    it.each([4400, 4403])("stops instead of reconnecting after close code %i", async (code) => {
        const { handlers, fetchConnectToken } = setup();
        const ws = await confirm();
        ws.serverClose(code);
        await vi.advanceTimersByTimeAsync(60_000);

        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(fetchConnectToken).toHaveBeenCalledOnce();
        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
        const [{ error }] = handlers.onError.mock.calls.at(-1)!;
        expect(error).toMatchObject({ realtimeCode: code, retryable: false });
    });

    it("fetches the connect token before opening the socket", async () => {
        let resolveToken: (token: string) => void = () => {};
        setup({ fetchConnectToken: () => new Promise((resolve) => (resolveToken = resolve)) });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(FakeWebSocket.instances).toHaveLength(0);

        resolveToken("connect-token");
        await flush();
        const ws = FakeWebSocket.instances[0]!;
        ws.open();
        expect(ws.sent[0]!.op).toMatchObject({ case: "auth", value: { token: "connect-token" } });
    });

    it("waits at least 0.5 seconds before the first reconnect", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
        setup();
        const ws = await confirm();
        ws.serverClose(1001);

        await vi.advanceTimersByTimeAsync(499);
        expect(FakeWebSocket.instances).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        await flush();
        expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it("keeps backing off when connections authenticate and then close right away", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
        setup();
        const first = await confirm();
        first.receive("", 0n, { case: "authenticated", value: { expiresTsSec: 1n } });
        first.serverClose(4408);
        await vi.advanceTimersByTimeAsync(500);
        await openAll();
        const second = FakeWebSocket.instances[1]!;
        second.receive("", 0n, { case: "authenticated", value: { expiresTsSec: 1n } });
        second.serverClose(4408);

        await vi.advanceTimersByTimeAsync(999);
        expect(FakeWebSocket.instances).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1);
        await flush();
        expect(FakeWebSocket.instances).toHaveLength(3);
    });

    it("retries a connect token failure that is not an SDK error", async () => {
        let calls = 0;
        const { handlers, fetchConnectToken } = setup({
            fetchConnectToken: async () => {
                if (calls++ === 0) throw new SyntaxError("Unexpected token <");
                return "connect-token";
            },
        });
        await openAll();
        await vi.advanceTimersByTimeAsync(10_000);
        await openAll();

        expect(fetchConnectToken).toHaveBeenCalledTimes(2);
        expect(handlers.onDisconnected).not.toHaveBeenCalled();
        expect(FakeWebSocket.instances.at(-1)!.ops("subscribe")).toHaveLength(1);
    });

    it("resubscribes when the server ends a subscription for any reason", async () => {
        setup();
        const ws = await confirm();
        ws.receive("s1", 1n, { case: "snapshotBegin", value: {} });
        ws.receive("s1", 2n, { case: "snapshotEnd", value: { cursor: "c1", count: 0 } });
        ws.receive("s1", 0n, {
            case: "unsubscribed",
            value: { reason: Unsubscribed_Reason.REASON_UNSPECIFIED },
        });
        await flush();

        expect(ws.ops("subscribe")).toHaveLength(2);
        expect(ws.ops("subscribe").at(-1)).toMatchObject({ cursor: "c1" });
    });

    it("backs off resubscribes that keep failing before delivering anything", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
        setup();
        const ws = await confirm("s1");
        ws.receive("s1", 1n, { case: "snapshotBegin", value: {} });
        ws.receive("s1", 2n, { case: "snapshotEnd", value: { cursor: "c1", count: 1 } });
        await flush();
        expect(ws.ops("subscribe")).toHaveLength(2);

        await confirm("s2");
        ws.receive("s2", 1n, { case: "snapshotBegin", value: {} });
        ws.receive("s2", 2n, { case: "snapshotEnd", value: { cursor: "c1", count: 1 } });
        await flush();
        expect(ws.ops("subscribe")).toHaveLength(2);

        await vi.advanceTimersByTimeAsync(1_000);
        await flush();
        expect(ws.ops("subscribe")).toHaveLength(3);
    });

    it("releases a refresh request once the server confirms it", async () => {
        const { handlers } = setup();
        const ws = await confirm("s1");
        ws.receive("s1", 0n, { case: "subscribeExpiring", value: { expiresTsSec: 1n } });
        await flush();
        const refresh = ws.ops("subscribeRefresh")[0] as { id: string };
        ws.receive("s1", 0n, { case: "subscribeRefreshed", value: { id: refresh.id } });

        // A late reply to the same ID no longer matches a pending refresh, so it is dropped.
        ws.receive("s1", 0n, {
            case: "error",
            value: { id: refresh.id, code: RequestError_Code.FORBIDDEN },
        });
        expect(handlers.onError).not.toHaveBeenCalled();
    });

    it("notifies a terminal failure after a reconnect only once", async () => {
        const { handlers, fetchConnectToken } = setup();
        const ws = await confirm();
        ws.serverClose(1001);
        fetchConnectToken.mockImplementation(async () => {
            throw new AuthenticationError("signed out");
        });
        await vi.advanceTimersByTimeAsync(10_000);
        await openAll();

        expect(handlers.onError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "connection_token" }),
        );
        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
    });

    it("does not report errors for its own unsubscribe to other subscriptions", async () => {
        const { stream, handlers } = setup();
        const ws = await confirm("s1");
        const other = subscriber(stream, OTHER_ACCOUNT);
        await confirm("s2");
        ws.receive("s1", 2n, { case: "covered", value: { cursor: "c1" } });
        const unsubscribe = ws.ops("unsubscribe")[0] as { id: string };

        ws.receive("s1", 0n, {
            case: "error",
            value: { id: unsubscribe.id, code: RequestError_Code.SUBSCRIPTION_UNKNOWN },
        });

        expect(handlers.onError).not.toHaveBeenCalled();
        expect(other.handlers.onError).not.toHaveBeenCalled();
    });

    it("cancels a pending subscribe token retry on unsubscribe", async () => {
        const { unsubscribe } = setup({
            fetchSubscribeToken: async () => {
                throw new NetworkError("offline");
            },
        });
        await openAll();
        unsubscribe();
        await flush();

        expect(vi.getTimerCount()).toBe(0);
    });

    it("shares one server subscription per account and catches a late consumer up", async () => {
        const { stream, handlers } = setup();
        const ws = await confirm("s1");
        snapshot(ws, "s1", "c1", [order(1n), order(2n)]);
        ws.receive("s1", 4n, {
            case: "unit",
            value: { nextCursor: "c2", orders: [order(3n)], removedOrderIds: [1n] },
        });
        ws.receive("s1", 5n, { case: "unavailable", value: {} });

        const late = subscriber(stream);
        await flush();

        expect(ws.ops("subscribe")).toHaveLength(1);
        expect(late.handlers.onConnected).toHaveBeenCalledOnce();
        const events = late.handlers.onEvent.mock.calls.map(([event]) => event);
        expect(events.map((event) => event.type)).toEqual(["snapshot", "stale"]);
        expect(events[0].orders.map((o: { orderId: bigint }) => o.orderId)).toEqual([2n, 3n]);
        expect(events[1]).toEqual({ type: "stale", stale: true });

        ws.receive("s1", 6n, { case: "unit", value: { nextCursor: "c3", orders: [order(4n)] } });
        expect(late.handlers.onEvent).toHaveBeenCalledTimes(3);
        expect(handlers.onEvent).toHaveBeenCalledTimes(4);
    });

    it("keeps a shared subscription until its last consumer leaves", async () => {
        const { stream, unsubscribe } = setup();
        const ws = await confirm("s1");
        const other = subscriber(stream);
        await flush();

        unsubscribe();
        await flush();
        expect(ws.ops("unsubscribe")).toEqual([]);

        other.unsubscribe();
        await flush();
        expect(ws.ops("unsubscribe")).toEqual([expect.objectContaining({ sub: "s1" })]);
        expect(ws.closed).toMatchObject({ code: 1000 });
    });

    it("resubscribes at once again after a resumed subscription reports ready", async () => {
        setup();
        const ws = await confirm("s1");
        snapshot(ws, "s1", "c1");
        ws.receive("s1", 5n, { case: "covered", value: { cursor: "c2" } });
        await flush();
        expect(ws.ops("subscribe")).toHaveLength(2);

        await confirm("s2");
        ws.receive("s2", 1n, { case: "ready", value: {} });
        ws.receive("s2", 3n, { case: "covered", value: { cursor: "c3" } });
        await flush();

        expect(ws.ops("subscribe")).toHaveLength(3);
    });

    it("does not report a departed consumer's request error to other consumers", async () => {
        const { stream, handlers } = setup();
        const ws = await confirm("s1");
        const other = subscriber(stream, OTHER_ACCOUNT);
        await flush();
        const request = ws.ops("subscribe").at(-1) as { id: string };
        other.unsubscribe();
        await flush();

        ws.receive("", 0n, {
            case: "error",
            value: { id: request.id, code: RequestError_Code.FORBIDDEN },
        });

        expect(handlers.onError).not.toHaveBeenCalled();
        expect(other.handlers.onError).not.toHaveBeenCalled();
    });

    it("closes and reopens consumers around a resubscribe on the same connection", async () => {
        const { handlers } = setup();
        const ws = await confirm("s1");
        snapshot(ws, "s1", "c1");
        ws.receive("s1", 5n, { case: "covered", value: { cursor: "c2" } });
        expect(handlers.onDisconnected).toHaveBeenCalledOnce();

        await confirm("s2");
        expect(handlers.onConnected).toHaveBeenCalledTimes(2);
    });

    it("reports a dropped connection through onDisconnected, not onError", async () => {
        const { handlers } = setup();
        const ws = await confirm();
        ws.serverClose(1001);
        await vi.advanceTimersByTimeAsync(1_000);
        await confirm("s2");

        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
        expect(handlers.onConnected).toHaveBeenCalledTimes(2);
        expect(handlers.onError).not.toHaveBeenCalled();
    });

    it("ends the stream when the WebSocket cannot be constructed", async () => {
        const failure = new Error("The operation is insecure.");
        vi.stubGlobal(
            "WebSocket",
            class {
                constructor() {
                    throw failure;
                }
            },
        );
        const { handlers } = setup();
        await flush();

        expect(handlers.onError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "connection", error: failure }),
        );
        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
    });

    it("keeps the connection and subscription when a consumer replaces itself in the same tick", async () => {
        const { stream, unsubscribe } = setup();
        const ws = await confirm("s1");
        snapshot(ws, "s1", "c1");

        unsubscribe();
        const next = subscriber(stream);
        await flush();

        expect(ws.ops("unsubscribe")).toEqual([]);
        expect(ws.closed).toBeUndefined();
        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(next.handlers.onConnected).toHaveBeenCalledOnce();
        expect(next.handlers.onEvent).toHaveBeenCalledWith(
            expect.objectContaining({ type: "snapshot" }),
        );
    });

    it("resets the reconnect backoff after a connection stays up 10 seconds", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
        setup();
        const first = await confirm();
        first.serverClose(4408);
        await vi.advanceTimersByTimeAsync(500);
        await openAll();
        const second = FakeWebSocket.instances[1]!;
        for (let i = 0; i < 10; i++) {
            await vi.advanceTimersByTimeAsync(1_000);
            second.receive("", 0n, { case: "heartbeat", value: { serverTsNs: 1n } });
        }
        second.serverClose(4408);

        await vi.advanceTimersByTimeAsync(499);
        expect(FakeWebSocket.instances).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1);
        await flush();
        expect(FakeWebSocket.instances).toHaveLength(3);
    });

    it("keeps the connection when a connect token refresh fails transiently", async () => {
        const { handlers, fetchConnectToken } = setup();
        const ws = await confirm();
        fetchConnectToken.mockRejectedValueOnce(new NetworkError("offline"));
        ws.receive("", 0n, { case: "tokenExpiring", value: { expiresTsSec: 1n } });
        await flush();

        expect(handlers.onError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "connection_token" }),
        );
        expect(handlers.onDisconnected).not.toHaveBeenCalled();
        expect(ws.closed).toBeUndefined();
    });

    it("ends the stream when a connect token refresh is refused", async () => {
        const { handlers, fetchConnectToken } = setup();
        const ws = await confirm();
        fetchConnectToken.mockRejectedValueOnce(new AuthenticationError("signed out"));
        ws.receive("", 0n, { case: "tokenExpiring", value: { expiresTsSec: 1n } });
        await flush();

        expect(handlers.onError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "connection_token" }),
        );
        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
        expect(ws.closed).toMatchObject({ code: 1000 });
    });

    it.each(["unsubscribe", "disconnect"] as const)(
        "opens no socket after %s while the connect token loads",
        async (stop) => {
            let resolveToken: (token: string) => void = () => {};
            const { stream, unsubscribe } = setup({
                fetchConnectToken: () => new Promise((resolve) => (resolveToken = resolve)),
            });
            if (stop === "unsubscribe") unsubscribe();
            else stream.disconnect();
            await flush();
            resolveToken("connect-token");
            await flush();

            expect(FakeWebSocket.instances).toHaveLength(0);
        },
    );

    it("ends only the subscription the server refuses for the subscription limit", async () => {
        const { stream, handlers } = setup();
        const ws = await confirm("s1");
        const other = subscriber(stream, OTHER_ACCOUNT);
        await flush();
        const request = ws.ops("subscribe").at(-1) as { id: string };

        ws.receive("", 0n, {
            case: "error",
            value: { id: request.id, code: RequestError_Code.TOO_MANY_SUBSCRIPTIONS },
        });

        expect(other.handlers.onError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "subscribe" }),
        );
        expect(other.handlers.onDisconnected).toHaveBeenCalledOnce();
        expect(handlers.onError).not.toHaveBeenCalled();
        expect(ws.closed).toBeUndefined();
    });

    it("keeps a subscription its consumer opens again from onDisconnected after a terminal close", async () => {
        const { stream, handlers } = setup();
        const ws = await confirm();
        let replacement: ReturnType<typeof subscriber> | undefined;
        handlers.onDisconnected.mockImplementation(() => {
            replacement = subscriber(stream);
        });

        ws.serverClose(4403);

        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
        expect(replacement?.handlers.onDisconnected).not.toHaveBeenCalled();
        expect(replacement?.handlers.onError).not.toHaveBeenCalled();
        expect(stream.activeChannels).toBe(1);
        await openAll();
        expect(FakeWebSocket.instances).toHaveLength(2);
        expect(FakeWebSocket.instances[1]!.ops("subscribe")).toHaveLength(1);
    });

    it("does not report an error to a subscription opened from onError", async () => {
        const { stream, handlers } = setup();
        const ws = await confirm();
        let other: ReturnType<typeof subscriber> | undefined;
        handlers.onError.mockImplementationOnce(() => {
            other = subscriber(stream, OTHER_ACCOUNT);
        });

        ws.onmessage?.({ data: "not binary" });

        expect(handlers.onError).toHaveBeenCalledWith(expect.objectContaining({ type: "decode" }));
        expect(other?.handlers.onError).not.toHaveBeenCalled();
    });

    it("reports a missing global WebSocket after connect returns", async () => {
        vi.stubGlobal("WebSocket", undefined);
        const { handlers } = setup();

        expect(handlers.onError).not.toHaveBeenCalled();
        expect(handlers.onDisconnected).not.toHaveBeenCalled();
        await flush();
        expect(handlers.onError).toHaveBeenCalledWith(
            expect.objectContaining({ type: "connection_token" }),
        );
        expect(handlers.onDisconnected).toHaveBeenCalledOnce();
    });

    it("delivers nothing more once a consumer disconnects the stream mid-delivery", async () => {
        const { stream, handlers } = setup();
        const ws = await confirm();
        const other = subscriber(stream);
        await flush();
        handlers.onEvent.mockImplementation(() => stream.disconnect());

        snapshot(ws, "s1", "c1");

        expect(handlers.onEvent).toHaveBeenCalledOnce();
        expect(other.handlers.onEvent).not.toHaveBeenCalled();
    });

    it("stops catching a late consumer up once it disconnects the stream", async () => {
        const { stream } = setup();
        const ws = await confirm();
        snapshot(ws, "s1", "c1");
        ws.receive("s1", 4n, { case: "unavailable", value: {} });
        const late = subscriber(stream);
        late.handlers.onConnected.mockImplementation(() => stream.disconnect());
        await flush();

        expect(late.handlers.onConnected).toHaveBeenCalledOnce();
        expect(late.handlers.onEvent).not.toHaveBeenCalled();
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
        await Promise.resolve();
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

    function authedClient(): RealtimeClient {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ token: "token" })),
        );
        return new RealtimeClient({
            wsUrl: "wss://api.test",
            tokenEndpoint: "https://api.test/v1/rt/token",
            subscribeEndpoint: "https://api.test/v1/rt/subscribe",
            privateWsUrl: "wss://api.test/v1/ws/private",
            hasAuth: () => true,
        });
    }

    /** Waits for the stream's socket, opens it, and confirms its subscription. */
    async function liveSocket(): Promise<FakeWebSocket> {
        await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
        const ws = FakeWebSocket.instances[0]!;
        ws.open();
        await vi.waitFor(() => expect(ws.ops("subscribe")).toHaveLength(1));
        const request = ws.ops("subscribe")[0] as { id: string };
        ws.receive("s1", 0n, { case: "subscribed", value: { id: request.id, account: 42n } });
        return ws;
    }

    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    it("counts order streams in the connection stats", async () => {
        const client = authedClient();
        client.connectPrivateOrders({ accountId: ACCOUNT, onEvent: vi.fn() });
        await liveSocket();

        expect(client.isConnected).toBe(true);
        expect(client.activeChannels).toBe(1);
        expect(client.totalConsumers).toBe(1);
        client.disconnect();
        expect(client.isConnected).toBe(false);
        expect(client.activeChannels).toBe(0);
    });

    it("reuses a live order stream when a consumer resubscribes in the same tick", async () => {
        const client = authedClient();
        const stop = client.connectPrivateOrders({ accountId: ACCOUNT, onEvent: vi.fn() });
        const ws = await liveSocket();

        stop();
        client.connectPrivateOrders({ accountId: ACCOUNT, onEvent: vi.fn() });
        await tick();

        expect(ws.closed).toBeUndefined();
        expect(ws.ops("unsubscribe")).toEqual([]);
        expect(FakeWebSocket.instances).toHaveLength(1);
        client.disconnect();
    });

    it.each(["disconnect", "disconnectPrivate"] as const)(
        "closes a live order stream silently on %s",
        async (method) => {
            const client = authedClient();
            const onDisconnected = vi.fn();
            const onError = vi.fn();
            client.connectPrivateOrders({
                accountId: ACCOUNT,
                onEvent: vi.fn(),
                onDisconnected,
                onError,
            });
            const ws = await liveSocket();

            client[method]();

            expect(ws.closed).toMatchObject({ code: 1000 });
            expect(onDisconnected).not.toHaveBeenCalled();
            expect(onError).not.toHaveBeenCalled();
        },
    );

    it("does not connect a consumer whose stream was torn down while loading", async () => {
        const client = authedClient();
        client.connectPrivateOrders({ accountId: ACCOUNT, onEvent: vi.fn() });
        client.disconnectPrivate();
        await tick();
        await tick();

        expect(FakeWebSocket.instances).toHaveLength(0);
    });

    it("reports a stream module load failure only to consumers that were not torn down", async () => {
        vi.resetModules();
        vi.doMock("./private-orders.js", () => {
            throw new Error("chunk load failed");
        });
        const unhandled = vi.fn();
        process.on("unhandledRejection", unhandled);
        try {
            const { RealtimeClient: FreshClient } = await import("./client.js");
            const client = new FreshClient({
                wsUrl: "wss://api.test",
                tokenEndpoint: "https://api.test/v1/rt/token",
                subscribeEndpoint: "https://api.test/v1/rt/subscribe",
                privateWsUrl: "wss://api.test/v1/ws/private",
                hasAuth: () => true,
            });
            const torn = { onError: vi.fn(), onDisconnected: vi.fn() };
            client.connectPrivateOrders({ accountId: ACCOUNT, onEvent: vi.fn(), ...torn });
            client.disconnectPrivate();
            const live = { onError: vi.fn(), onDisconnected: vi.fn() };
            client.connectPrivateOrders({ accountId: ACCOUNT, onEvent: vi.fn(), ...live });
            await vi.waitFor(() =>
                expect(live.onError).toHaveBeenCalledWith(
                    expect.objectContaining({ type: "transport_load" }),
                ),
            );
            await tick();

            expect(live.onDisconnected).toHaveBeenCalledOnce();
            expect(torn.onError).not.toHaveBeenCalled();
            expect(torn.onDisconnected).not.toHaveBeenCalled();
            expect(unhandled).not.toHaveBeenCalled();
        } finally {
            process.off("unhandledRejection", unhandled);
            vi.doUnmock("./private-orders.js");
            vi.resetModules();
        }
    });
});
