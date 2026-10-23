import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import type { Order } from "../gen/orders/v1/orders_read_pb.js";
import {
    Channel,
    ClientMessageSchema,
    RequestError_Code,
    ServerMessageSchema,
    type Unit,
} from "../gen/privatews/v1/private_ws_pb.js";
import { ConfigurationError, PolyesterError, RealtimeError } from "../shared/errors.js";
import {
    createSdkSubscriptionErrorContext,
    publicationHandlerErrorContext,
    type SdkSubscriptionErrorContext,
} from "../shared/subscription-errors.js";
import { idToBigInt } from "../utils/base58-id.js";

export const PRIVATE_WS_SUBPROTOCOL = "polyester.v1.proto";
const HEARTBEAT_TIMEOUT_MS = 3_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 10_000;
/** A connection that stayed up this long resets the reconnect backoff. */
const STABLE_CONNECTION_MS = 10_000;
/** A malformed frame (4400) and a rejected connect token (4403) recur on every reconnect. */
const TERMINAL_CLOSE_CODES = new Set([4400, 4403]);

/** One delivery of an account's order stream. */
export type PrivateOrdersEvent =
    /** The account's full live view; replace local state with it. */
    | { type: "snapshot"; orders: Order[] }
    /** One change, applied whole. */
    | { type: "unit"; unit: Unit }
    /** The account's live view is temporarily behind (`true`) or caught up (`false`). */
    | { type: "stale"; stale: boolean };

export interface ConnectPrivateOrdersParams {
    /** The account's base58 public ID. */
    accountId: string;
    onEvent: (event: PrivateOrdersEvent) => void;
    /** Called when the server confirms the subscription, again after each reconnect. */
    onConnected?: () => void;
    /** Called when the connection carrying the subscription drops. */
    onDisconnected?: () => void;
    onError?: (ctx: SdkSubscriptionErrorContext) => void;
}

export interface PrivateOrderStreamConfig {
    url: string;
    fetchConnectToken: () => Promise<string>;
    fetchSubscribeToken: (channel: string) => Promise<string>;
}

type ClientOp = MessageInitShape<typeof ClientMessageSchema>["op"];

interface StreamSubscription {
    params: ConnectPrivateOrdersParams;
    channel: string;
    account: bigint;
    /** Server subscription ID; empty until Subscribed. */
    sub: string;
    seq: bigint;
    /** Last applied resume position, carried across resubscribes and reconnects. */
    cursor: string;
    staged: Order[] | null;
    /** The last connection state the consumer was told about. */
    state: "pending" | "connected" | "disconnected";
    /** The consumer was told the view is stale and not yet that it caught up. */
    stale: boolean;
    /** Subscribe attempts since the subscription last delivered data; drives retry backoff. */
    retries: number;
    retryTimer: ReturnType<typeof setTimeout> | null;
}

type PendingRequest = { kind: "subscribe" | "refresh"; s: StreamSubscription };

/** 0.5 s doubling to 10 s, jittered over the upper half of each step. */
function backoffMs(attempt: number): number {
    const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempt + 1));
    return ceiling / 2 + Math.random() * (ceiling / 2);
}

function isTerminalTokenError(error: unknown): boolean {
    return error instanceof PolyesterError && !error.retryable;
}

/**
 * Account order streams over the private WebSocket (`/v1/ws/private`). One
 * connection carries every subscription; each resumes from its last cursor
 * after a gap, an expired token, or a reconnect.
 */
export class PrivateOrderStream {
    readonly #config: PrivateOrderStreamConfig;
    readonly #subs = new Set<StreamSubscription>();
    readonly #pending = new Map<string, PendingRequest>();
    readonly #bySub = new Map<string, StreamSubscription>();
    /** IDs of Unsubscribe requests awaiting their answer. */
    readonly #unsubscribing = new Set<string>();
    #ws: WebSocket | null = null;
    /** A connect token fetch for the next socket is in flight. */
    #connecting = false;
    /** Bumped on shutdown so a token fetch that outlived it opens nothing. */
    #generation = 0;
    #authSent = false;
    #authSentAt = 0;
    #reconnectAttempt = 0;
    #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    #heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    #requestSeq = 0;

    constructor(config: PrivateOrderStreamConfig) {
        this.#config = config;
    }

    /** Throws ValidationError when accountId is not a base58 public ID. */
    connect(params: ConnectPrivateOrdersParams): () => void {
        // ponytail: one server subscription per consumer; share by account if 64 per connection gets tight.
        const s: StreamSubscription = {
            params,
            channel: `private:spot:orders:${params.accountId}`,
            account: idToBigInt(params.accountId, "accountId"),
            sub: "",
            seq: 0n,
            cursor: "",
            staged: null,
            state: "pending",
            stale: false,
            retries: 0,
            retryTimer: null,
        };
        this.#subs.add(s);
        if (this.#ws && this.#authSent) void this.#subscribe(this.#ws, s);
        else if (!this.#ws && !this.#connecting && !this.#reconnectTimer) this.#open();
        return () => this.#remove(s);
    }

    /** Closes the connection and drops every subscription without callbacks. */
    disconnect(): void {
        for (const s of this.#subs) this.#clearRetry(s);
        this.#subs.clear();
        this.#shutdown();
    }

    /** Fetches the connect token first: the server closes a socket that sends no Auth within 5 seconds. */
    #open(): void {
        const WebSocketCtor = globalThis.WebSocket;
        if (!WebSocketCtor) {
            this.#terminateAll(
                "connection_token",
                new ConfigurationError("The private order stream requires a global WebSocket."),
            );
            return;
        }
        const generation = this.#generation;
        this.#connecting = true;
        this.#config.fetchConnectToken().then(
            (token) => {
                if (generation !== this.#generation) return;
                this.#connecting = false;
                const ws = new WebSocketCtor(this.#config.url, PRIVATE_WS_SUBPROTOCOL);
                ws.binaryType = "arraybuffer";
                this.#ws = ws;
                this.#authSent = false;
                ws.onopen = () => this.#authenticate(ws, token);
                ws.onmessage = (event: MessageEvent) => this.#onFrame(ws, event.data);
                ws.onclose = (event: CloseEvent) => this.#onClosed(ws, event.code, event.reason);
            },
            (error: unknown) => {
                if (generation !== this.#generation) return;
                this.#connecting = false;
                if (isTerminalTokenError(error)) {
                    this.#terminateAll("connection_token", error);
                    return;
                }
                this.#reportAll("connection_token", error);
                this.#scheduleReconnect();
            },
        );
    }

    #authenticate(ws: WebSocket, token: string): void {
        this.#send(ws, { case: "auth", value: { token } });
        this.#authSent = true;
        this.#authSentAt = Date.now();
        this.#armHeartbeat(ws);
        for (const s of this.#subs) void this.#subscribe(ws, s);
    }

    async #reauthenticate(ws: WebSocket): Promise<void> {
        try {
            const token = await this.#config.fetchConnectToken();
            if (this.#ws === ws) this.#send(ws, { case: "auth", value: { token } });
        } catch (error) {
            if (this.#ws !== ws) return;
            if (isTerminalTokenError(error)) this.#terminateAll("connection_token", error);
            else this.#reportAll("connection_token", error);
        }
    }

    async #subscribe(ws: WebSocket, s: StreamSubscription): Promise<void> {
        if (!this.#subs.has(s)) return;
        const id = this.#nextRequestId();
        this.#pending.set(id, { kind: "subscribe", s });
        let token: string;
        try {
            token = await this.#config.fetchSubscribeToken(s.channel);
        } catch (error) {
            if (this.#pending.get(id)?.s !== s) return;
            this.#pending.delete(id);
            if (isTerminalTokenError(error)) {
                this.#terminate(s, "subscription_token", error);
                return;
            }
            this.#report(s, "subscription_token", error);
            this.#retrySubscribe(ws, s);
            return;
        }
        if (this.#ws !== ws || this.#pending.get(id)?.s !== s) return;
        this.#send(ws, {
            case: "subscribe",
            value: { id, channel: Channel.ORDERS, account: s.account, token, cursor: s.cursor },
        });
    }

    /** Subscribes again after a backoff that grows until the subscription delivers data. */
    #retrySubscribe(ws: WebSocket, s: StreamSubscription): void {
        this.#clearRetry(s);
        s.retryTimer = setTimeout(
            () => {
                s.retryTimer = null;
                if (this.#ws === ws && this.#subs.has(s) && !s.sub) void this.#subscribe(ws, s);
            },
            backoffMs(s.retries++),
        );
    }

    #clearRetry(s: StreamSubscription): void {
        if (s.retryTimer) clearTimeout(s.retryTimer);
        s.retryTimer = null;
    }

    async #refresh(ws: WebSocket, s: StreamSubscription): Promise<void> {
        const sub = s.sub;
        let token: string;
        try {
            token = await this.#config.fetchSubscribeToken(s.channel);
        } catch (error) {
            // An unrefreshed subscription ends with TOKEN_EXPIRED and resubscribes.
            if (this.#ws === ws && s.sub === sub) this.#report(s, "subscription_token", error);
            return;
        }
        if (this.#ws !== ws || s.sub !== sub) return;
        const id = this.#nextRequestId();
        this.#pending.set(id, { kind: "refresh", s });
        this.#send(ws, { case: "subscribeRefresh", value: { id, sub, token } });
    }

    /**
     * Drops the server subscription and subscribes again from the last applied cursor:
     * at once the first time, then with backoff until the subscription delivers data.
     */
    #resubscribe(ws: WebSocket, s: StreamSubscription): void {
        if (s.sub) {
            this.#bySub.delete(s.sub);
            this.#unsubscribe(ws, s.sub);
        }
        s.sub = "";
        s.seq = 0n;
        s.staged = null;
        if (s.retries > 0) {
            this.#retrySubscribe(ws, s);
            return;
        }
        s.retries = 1;
        void this.#subscribe(ws, s);
    }

    #unsubscribe(ws: WebSocket, sub: string): void {
        const id = this.#nextRequestId();
        this.#unsubscribing.add(id);
        this.#send(ws, { case: "unsubscribe", value: { id, sub } });
    }

    #onFrame(ws: WebSocket, data: unknown): void {
        if (this.#ws !== ws) return;
        this.#armHeartbeat(ws);
        if (!(data instanceof ArrayBuffer)) {
            this.#reportAll(
                "decode",
                new RealtimeError("Expected a binary private WebSocket frame"),
            );
            return;
        }
        let msg;
        try {
            msg = fromBinary(ServerMessageSchema, new Uint8Array(data));
        } catch (error) {
            this.#reportAll("decode", error);
            return;
        }
        const frame = msg.frame;

        switch (frame.case) {
            case "subscribed": {
                const request = this.#pending.get(frame.value.id);
                if (request?.kind !== "subscribe") {
                    // Its consumer left before the server confirmed it.
                    if (msg.sub) this.#unsubscribe(ws, msg.sub);
                    return;
                }
                this.#pending.delete(frame.value.id);
                const s = request.s;
                s.sub = msg.sub;
                s.seq = 0n;
                this.#bySub.set(msg.sub, s);
                if (s.state !== "connected") {
                    s.state = "connected";
                    this.#deliver(s, () => s.params.onConnected?.());
                }
                // A new subscription reports Unavailable itself if its view is still behind.
                if (s.stale) {
                    s.stale = false;
                    this.#deliver(s, () => s.params.onEvent({ type: "stale", stale: false }));
                }
                return;
            }
            case "subscribeRefreshed":
                this.#pending.delete(frame.value.id);
                return;
            case "unsubscribed":
                if (this.#unsubscribing.delete(frame.value.id)) return;
                break;
            case "error":
                this.#onRequestError(ws, msg.sub, frame.value);
                return;
            case "tokenExpiring":
                void this.#reauthenticate(ws);
                return;
        }

        const s = this.#bySub.get(msg.sub);
        if (!s) return;
        if (msg.seq > 0n) {
            if (msg.seq !== s.seq + 1n) {
                this.#resubscribe(ws, s);
                return;
            }
            s.seq = msg.seq;
        }

        switch (frame.case) {
            case "snapshotBegin":
                s.staged = [];
                return;
            case "snapshotPage":
                s.staged?.push(...frame.value.orders);
                return;
            case "snapshotEnd": {
                const orders = s.staged;
                s.staged = null;
                if (!orders || orders.length !== frame.value.count) {
                    s.cursor = "";
                    this.#resubscribe(ws, s);
                    return;
                }
                s.cursor = frame.value.cursor;
                s.retries = 0;
                this.#deliver(s, () => s.params.onEvent({ type: "snapshot", orders }));
                return;
            }
            case "unit": {
                const unit = frame.value;
                s.cursor = unit.nextCursor;
                s.retries = 0;
                this.#deliver(s, () => s.params.onEvent({ type: "unit", unit }));
                return;
            }
            case "covered":
                s.cursor = frame.value.cursor;
                return;
            case "unavailable":
            case "available": {
                const stale = frame.case === "unavailable";
                s.stale = stale;
                this.#deliver(s, () => s.params.onEvent({ type: "stale", stale }));
                return;
            }
            case "subscribeExpiring":
                void this.#refresh(ws, s);
                return;
            case "unsubscribed":
                // The server ended it: its token expired, or for a reason this client does not know.
                this.#bySub.delete(s.sub);
                s.sub = "";
                this.#resubscribe(ws, s);
                return;
        }
    }

    #onRequestError(
        ws: WebSocket,
        sub: string,
        error: { id: string; code: RequestError_Code; message: string },
    ): void {
        if (error.id && this.#unsubscribing.delete(error.id)) return;
        const request = error.id ? this.#pending.get(error.id) : undefined;
        if (request) this.#pending.delete(error.id);
        const s = request?.s ?? this.#bySub.get(sub);
        const realtimeError = new RealtimeError(
            error.message ||
                `Private order stream request failed: ${RequestError_Code[error.code]}`,
            { realtimeCode: error.code },
        );
        if (!s) {
            this.#reportAll("request", realtimeError);
            return;
        }
        if (request?.kind === "subscribe") {
            if (error.code === RequestError_Code.CURSOR_INVALID) {
                s.cursor = "";
                void this.#subscribe(ws, s);
                return;
            }
            this.#terminate(s, "subscribe", realtimeError);
            return;
        }
        if (error.code === RequestError_Code.SUBSCRIPTION_UNKNOWN && s.sub === sub) {
            this.#bySub.delete(s.sub);
            s.sub = "";
            this.#resubscribe(ws, s);
            return;
        }
        this.#report(s, request?.kind ?? "request", realtimeError);
    }

    #onClosed(ws: WebSocket, code: number, reason: string): void {
        if (this.#ws !== ws) return;
        const stable = this.#authSent && Date.now() - this.#authSentAt >= STABLE_CONNECTION_MS;
        this.#detach();
        if (stable) this.#reconnectAttempt = 0;
        if (this.#subs.size === 0) return;

        const terminal = TERMINAL_CLOSE_CODES.has(code);
        const error = new RealtimeError(reason || `Private WebSocket closed with code ${code}`, {
            realtimeCode: code,
            retryable: !terminal,
        });
        if (terminal) {
            this.#terminateAll("disconnected", error);
            return;
        }
        for (const s of this.#subs) {
            this.#report(s, "disconnected", error);
            if (s.state === "connected") {
                s.state = "disconnected";
                this.#deliver(s, () => s.params.onDisconnected?.());
            }
        }
        if (this.#subs.size === 0) return;
        this.#scheduleReconnect();
    }

    #scheduleReconnect(): void {
        this.#reconnectTimer = setTimeout(
            () => {
                this.#reconnectTimer = null;
                if (this.#subs.size > 0 && !this.#ws && !this.#connecting) this.#open();
            },
            backoffMs(this.#reconnectAttempt++),
        );
    }

    #armHeartbeat(ws: WebSocket): void {
        if (this.#heartbeatTimer) clearTimeout(this.#heartbeatTimer);
        this.#heartbeatTimer = setTimeout(
            () => this.#drop(ws, 4000, "heartbeat timeout"),
            HEARTBEAT_TIMEOUT_MS,
        );
    }

    /** Treats the socket as closed now; a stale socket may not emit close for a long time. */
    #drop(ws: WebSocket, code: number, reason: string): void {
        if (this.#ws !== ws) return;
        try {
            ws.close(code, reason);
        } catch {
            // noop
        }
        this.#onClosed(ws, code, reason);
    }

    #detach(): void {
        const ws = this.#ws;
        this.#ws = null;
        this.#authSent = false;
        if (this.#heartbeatTimer) clearTimeout(this.#heartbeatTimer);
        this.#heartbeatTimer = null;
        this.#pending.clear();
        this.#bySub.clear();
        this.#unsubscribing.clear();
        for (const s of this.#subs) {
            this.#clearRetry(s);
            s.sub = "";
            s.seq = 0n;
            s.staged = null;
        }
        if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onclose = null;
        }
    }

    #shutdown(): void {
        const ws = this.#ws;
        this.#detach();
        this.#generation++;
        this.#connecting = false;
        if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
        this.#reconnectTimer = null;
        this.#reconnectAttempt = 0;
        try {
            ws?.close(1000);
        } catch {
            // noop
        }
    }

    #remove(s: StreamSubscription): void {
        if (!this.#subs.delete(s)) return;
        this.#clearRetry(s);
        const ws = this.#ws;
        if (ws && s.sub) {
            this.#bySub.delete(s.sub);
            this.#unsubscribe(ws, s.sub);
        }
        s.sub = "";
        for (const [id, request] of this.#pending) {
            if (request.s === s) this.#pending.delete(id);
        }
        if (this.#subs.size === 0) this.#shutdown();
    }

    #terminate(s: StreamSubscription, type: string, error: unknown): void {
        if (!this.#subs.has(s)) return;
        this.#report(s, type, error);
        this.#remove(s);
        if (s.state === "disconnected") return;
        s.state = "disconnected";
        this.#deliver(s, () => s.params.onDisconnected?.());
    }

    #terminateAll(type: string, error: unknown): void {
        for (const s of this.#subs) this.#terminate(s, type, error);
    }

    #send(ws: WebSocket, op: ClientOp): void {
        if (ws.readyState !== 1) return;
        ws.send(toBinary(ClientMessageSchema, create(ClientMessageSchema, { op })));
    }

    #nextRequestId(): string {
        return String(++this.#requestSeq);
    }

    #report(s: StreamSubscription, type: string, error: unknown): void {
        try {
            s.params.onError?.(createSdkSubscriptionErrorContext(s.channel, type, error));
        } catch {
            // Keep consumer error-handler failures isolated from the stream.
        }
    }

    #reportAll(type: string, error: unknown): void {
        for (const s of this.#subs) this.#report(s, type, error);
    }

    #deliver(s: StreamSubscription, deliver: () => void): void {
        try {
            deliver();
        } catch (error) {
            try {
                s.params.onError?.(publicationHandlerErrorContext(s.channel, error));
            } catch {
                // noop
            }
        }
    }
}
