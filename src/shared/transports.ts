import { createConnectTransport } from "@connectrpc/connect-web";
import type { Transport, Interceptor } from "@connectrpc/connect";
import { toBinary, toJsonString } from "@bufbuild/protobuf";
import { createErrorMappingTransport, TIMESTAMP_SKEW_CODE } from "./connect-error-mapping.js";
import {
    AuthenticationError,
    ConfigurationError,
    InternalServerError,
    isAbortError,
    isTimeoutAbortError,
    NetworkError,
    PolyesterError,
    TimeoutError,
    TimestampSkewError,
} from "./errors.js";

export { isAbortError };

export type ConnectWireFormat = "binary" | "json";

export const POLYESTER_MOCK_HEADER = "x-polyester-mock";

export interface TransportConfig {
    apiUrl: string;
    interceptors?: Interceptor[];
    auth?: JwtAuthProvider | ApiKeyEd25519AuthProvider;
    /**
     * Connect wire format. Defaults to binary for production performance.
     * Use `json` for the API Playground visualization.
     */
    wireFormat?: ConnectWireFormat;
    /**
     * Custom fetch implementation for SDK HTTP requests. Defaults to the global
     * `fetch`, resolved on each request.
     */
    fetch?: typeof fetch;
}

export interface Transports {
    authApi: Transport;
    publicApi: Transport;
}

/** Connect transports available to services that call authenticated APIs. */
export type AuthApiTransports = Pick<Transports, "authApi">;

/** Connect transports available to services that call public APIs. */
export type PublicApiTransports = Pick<Transports, "publicApi">;

/** Connect transports available to services that call both public and authenticated APIs. */
export type AuthAndPublicApiTransports = Pick<Transports, "authApi" | "publicApi">;

/**
 * Generic JWT auth for HTTP/Connect endpoints that follow the Bearer token contract.
 */
export interface JwtAuthProvider {
    kind: "jwt";
    /**
     * Typically wraps the configured browser auth token storage. The SDK reads
     * the current value for every request and for every realtime auth check, so
     * keep this cheap and return the freshest credential rather than caching.
     */
    getToken: () => string | null | Promise<string | null>;
}

/**
 * Generic Ed25519 API key auth for HTTP/Connect endpoints that follow the
 * X-API-KEY-ID / X-API-TIMESTAMP / X-API-SIGNATURE contract.
 *
 * Each request is signed immediately before dispatch, but the runtime's fetch
 * may still queue it (connection limits). Bound concurrency for large bursts;
 * a request that waits past its receive window fails with a retryable
 * `TimestampSkewError` (or its `RequestDeadlineExceededError` subclass), and
 * retrying signs it again. Timestamps strictly increase and lead the local
 * clock by at most 500 ms, so a burst that outruns the clock waits for it.
 */
export interface ApiKeyEd25519AuthProvider {
    kind: "api-key-ed25519";
    getKeyId: () => string | null | Promise<string | null>;
    /** Ed25519 secret key bytes (not hex) for signing. */
    getSecretKey: () => Uint8Array | null | Promise<Uint8Array | null>;
    /**
     * Receive window in whole milliseconds, 1 to 60000, sent and signed as
     * `X-API-RECV-WINDOW`. The backend processes a request only until its timestamp
     * plus this window and answers a later one with a retryable error. Omit for the
     * backend default of 5000. Timestamps more than 1000 ms ahead of the server clock are
     * refused, so keep the clock synchronized. A shorter window also frees replay capacity sooner.
     */
    recvWindow?: number;
}

export interface ApiKeyEd25519SigningRequest {
    url: string | URL;
    method: string;
    body?: Uint8Array;
    timestamp?: string;
    signal?: AbortSignal;
}

/** Largest `X-API-RECV-WINDOW` the backend accepts, in milliseconds. */
const MAX_API_KEY_RECV_WINDOW_MS = 60_000;

/** Largest non-Connect response body the SDK reads, such as an error body. */
const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;

/**
 * Returns the fetch implementation used by SDK transports.
 */
export function makeFetch(
    fetchImpl?: typeof fetch,
    maxBodyBytes = MAX_RESPONSE_BODY_BYTES,
): typeof fetch {
    const wrappedFetch = Object.assign(
        async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
            // Normalize headers into a mutable Headers object
            const headers = new Headers(init?.headers);

            let res: Response | undefined;
            let tooLarge = false;
            try {
                res = await (fetchImpl ?? fetch)(input, {
                    ...init,
                    headers,
                    redirect: "manual",
                });
                // Connect rejects anything but a 200 with a Connect content type
                // without reading the body, then aborts the request with its
                // ConnectError. Any reader still on that body (e.g. fetch
                // instrumentation reading a clone) would reject with the raw
                // ConnectError, unhandled. Buffer those bodies, up to a limit, so
                // the stream is complete before Connect aborts.
                if (res?.body && !isConnectResponse(res)) {
                    const body = await readAtMost(res.body, maxBodyBytes);
                    if (body) res = new Response(body, res);
                    else tooLarge = true;
                }
            } catch (err) {
                if (isAbortError(err)) throw err;
                if (isTimeoutAbortError(err)) {
                    throw new TimeoutError("Request timed out.", { cause: err });
                }
                throw new NetworkError("Transport request failed", { cause: err });
            }
            // A custom or patched fetch (browser extensions, monitoring scripts) can
            // resolve without a Response.
            if (!res) throw new NetworkError("Transport request returned no response");
            if (tooLarge) {
                throw new InternalServerError(
                    `Response body of HTTP ${res.status} exceeds ${maxBodyBytes} bytes`,
                    { status: res.status },
                );
            }
            // Connect discards non-Connect error bodies, so surface the problem+json
            // skew code here before it collapses into a bare HTTP status error.
            if (await isTimestampSkewProblem(res)) {
                throw new TimestampSkewError(
                    "API key timestamp is outside the allowed skew window.",
                    { status: res.status },
                );
            }
            return res;
        },
        fetch,
    );

    return wrappedFetch;
}

/** Reads a body of at most `limit` bytes, whatever its Content-Length; cancels a longer one and returns null. */
async function readAtMost(
    body: ReadableStream<Uint8Array<ArrayBuffer>>,
    limit: number,
): Promise<Blob | null> {
    const reader = body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return new Blob(chunks);
        size += value.byteLength;
        if (size > limit) {
            reader.cancel().catch(() => {});
            return null;
        }
        chunks.push(value);
    }
}

const CONNECT_CONTENT_TYPE_RE = /^application\/(?:connect\+)?(?:json|proto)\s*(?:;|$)/iu;

function isConnectResponse(res: Response): boolean {
    return (
        res.status === 200 && CONNECT_CONTENT_TYPE_RE.test(res.headers.get("content-type") ?? "")
    );
}

async function isTimestampSkewProblem(res: Response): Promise<boolean> {
    if (res.ok || !res.headers.get("content-type")?.includes("application/problem+json")) {
        return false;
    }
    try {
        const body: unknown = await res.clone().json();
        return (
            typeof body === "object" &&
            body !== null &&
            "code" in body &&
            body.code === TIMESTAMP_SKEW_CODE
        );
    } catch {
        return false;
    }
}

/**
 * Creates Connect transports for SDK service clients.
 */
export function createTransports(config: TransportConfig): Transports {
    const { apiUrl, interceptors = [], auth, wireFormat = "binary", fetch: fetchImpl } = config;
    const useBinaryFormat = wireFormat === "binary";
    const publicApi = createErrorMappingTransport(
        createConnectTransport({
            baseUrl: apiUrl,
            useBinaryFormat,
            // methods whose proto declares idempotency_level = NO_SIDE_EFFECTS go over
            // cacheable GET; every other method stays POST. authApi never uses GET.
            useHttpGet: true,
            interceptors,
            fetch: makeFetch(fetchImpl),
        }),
    );

    const authInterceptors = auth
        ? auth.kind === "jwt"
            ? [createAuthInterceptor(auth, { wireFormat }), ...interceptors]
            : [...interceptors, createAuthInterceptor(auth, { wireFormat })]
        : interceptors;
    const authApi = createErrorMappingTransport(
        createConnectTransport({
            baseUrl: apiUrl,
            useBinaryFormat,
            interceptors: authInterceptors,
            fetch: makeFetch(fetchImpl),
        }),
    );

    return { authApi, publicApi };
}

/**
 * Creates an interceptor that enables mock transport behavior.
 */
export function createMockInterceptor(getEnabled: () => boolean): Interceptor {
    return (next) => async (req) => {
        if (getEnabled()) req.header.set(POLYESTER_MOCK_HEADER, "true");
        return next(req);
    };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
        throw new ConfigurationError("SHA-256 not available in this environment");
    }
    const hash = await crypto.subtle.digest("SHA-256", bytes.slice());
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
    return (
        typeof value === "object" &&
        value !== null &&
        "then" in value &&
        typeof value.then === "function"
    );
}

function abortReason(signal: AbortSignal): unknown {
    return signal.reason !== undefined
        ? signal.reason
        : new DOMException("Request canceled.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw abortReason(signal);
}

function awaitWithSignal<T>(promise: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return Promise.resolve(promise);
    if (signal.aborted) {
        // Swallow late rejections from an abandoned promise so they never surface as unhandled.
        void Promise.resolve(promise).catch(() => {});
        return Promise.reject(abortReason(signal));
    }
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortReason(signal));
        signal.addEventListener("abort", onAbort, { once: true });
        Promise.resolve(promise).then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (err) => {
                signal.removeEventListener("abort", onAbort);
                reject(err);
            },
        );
    });
}

/** Half the backend's 1000 ms future limit, leaving room for clock offset. */
const MAX_TIMESTAMP_LEAD_MS = 500;

let lastTimestamp = 0;
/** Allocates strictly increasing timestamps, waiting for the clock when a burst outruns it. */
async function nextTimestamp(signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    const timestamp = Math.max(lastTimestamp + 1, Date.now());
    lastTimestamp = timestamp;
    const wait = timestamp - MAX_TIMESTAMP_LEAD_MS - Date.now();
    if (wait > 0) {
        await new Promise<void>((resolve, reject) => {
            const onAbort = () => {
                clearTimeout(timer);
                reject(abortReason(signal!));
            };
            const timer = setTimeout(() => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            }, wait);
            signal?.addEventListener("abort", onAbort, { once: true });
        });
    }
    return String(timestamp);
}

// The signing helpers below work on byte strings: one char per byte, so `<`
// compares bytes and non-UTF-8 escapes such as `%FF` survive. WHATWG URL
// serializes `pathname` and `search` as ASCII, so decoding them yields one.

/** Decodes `%XX` escapes, leaving malformed escapes as they are. */
function percentDecode(ascii: string): string {
    return ascii.replace(/%([\da-f]{2})/giu, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

/** Escapes every byte outside RFC 3986's unreserved set, as Go's `url.QueryEscape` with `%20` for space. */
function escapeQueryComponent(bytes: string): string {
    return bytes.replace(
        /[^\w.~-]/gu,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
    );
}

function compareBytes(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Canonicalizes a query as the server's API-key verifier does: form-decode each
 * pair, sort by key bytes then value bytes, and escape both again.
 */
function canonicalQueryString(search: string): string {
    const decode = (component: string) => percentDecode(component.replaceAll("+", " "));
    const pairs = search
        .slice(1)
        .split("&")
        .filter(Boolean)
        .map((pair): [string, string] => {
            const eq = pair.indexOf("=");
            return eq === -1
                ? [decode(pair), ""]
                : [decode(pair.slice(0, eq)), decode(pair.slice(eq + 1))];
        });
    pairs.sort(([ak, av], [bk, bv]) => compareBytes(ak, bk) || compareBytes(av, bv));
    return pairs.map(([k, v]) => `${escapeQueryComponent(k)}=${escapeQueryComponent(v)}`).join("&");
}

/**
 * Creates API-key authentication headers for endpoints using the Polyester Ed25519 signing contract.
 */
async function resolveApiKeyCredentials(
    auth: ApiKeyEd25519AuthProvider,
    signal?: AbortSignal,
): Promise<{ keyId: string; secretKey: Uint8Array }> {
    throwIfAborted(signal);
    let keyId: string | null;
    let secretKey: Uint8Array | null;
    try {
        const keyIdOrPromise = auth.getKeyId();
        let secretKeyOrPromise: Uint8Array | null | Promise<Uint8Array | null>;
        try {
            secretKeyOrPromise = auth.getSecretKey();
        } catch (err) {
            if (isPromiseLike(keyIdOrPromise)) void Promise.resolve(keyIdOrPromise).catch(() => {});
            throw err;
        }
        if (isPromiseLike(keyIdOrPromise) || isPromiseLike(secretKeyOrPromise)) {
            [keyId, secretKey] = await awaitWithSignal(
                Promise.all([keyIdOrPromise, secretKeyOrPromise]),
                signal,
            );
        } else {
            keyId = keyIdOrPromise;
            secretKey = secretKeyOrPromise;
        }
    } catch (cause) {
        if (signal?.aborted) throw abortReason(signal);
        if (cause instanceof PolyesterError) throw cause;
        throw new ConfigurationError("API key credential provider failed", { cause });
    }
    throwIfAborted(signal);
    if (!keyId || !secretKey) throw new ConfigurationError("Missing API key ID or secret key");
    if (!(secretKey instanceof Uint8Array) || secretKey.byteLength !== 32) {
        throw new ConfigurationError("API key secret key must contain exactly 32 bytes");
    }
    return { keyId, secretKey };
}

/** Signs exact protocol-defined payload bytes, such as a withdraw intent, with the API key. */
export async function signApiKeyEd25519Payload(
    auth: ApiKeyEd25519AuthProvider,
    payload: Uint8Array,
): Promise<Uint8Array> {
    const { secretKey } = await resolveApiKeyCredentials(auth);
    const { signAsync } = await import("@noble/ed25519");
    return signAsync(payload, secretKey);
}

export async function createApiKeyEd25519AuthHeaders(
    auth: ApiKeyEd25519AuthProvider,
    request: ApiKeyEd25519SigningRequest,
): Promise<Record<string, string>> {
    const { signal } = request;
    const { keyId, secretKey } = await resolveApiKeyCredentials(auth, signal);

    const { recvWindow } = auth;
    if (
        recvWindow !== undefined &&
        (!Number.isInteger(recvWindow) || recvWindow < 1 || recvWindow > MAX_API_KEY_RECV_WINDOW_MS)
    ) {
        throw new ConfigurationError(
            `API key recvWindow must be a whole number of milliseconds from 1 to ${MAX_API_KEY_RECV_WINDOW_MS}`,
        );
    }

    const urlObj = new URL(request.url);
    // The server refuses these whatever the signature, so fail before signing.
    if (urlObj.search.includes(";") || /%(?![\da-f]{2})/iu.test(urlObj.pathname + urlObj.search)) {
        throw new ConfigurationError(
            "Cannot sign a URL with a malformed percent-escape or a ';' in its query",
        );
    }
    const timestamp = request.timestamp ?? (await nextTimestamp(signal));
    const bodyHash = await awaitWithSignal(sha256Hex(request.body ?? new Uint8Array(0)), signal);
    throwIfAborted(signal);
    const canonicalQuery = canonicalQueryString(urlObj.search);
    // The window line is signed only when the header is sent.
    const windowLine = recvWindow === undefined ? "" : `${recvWindow}\n`;
    // The server signs the upper-cased method and the decoded path's bytes.
    const canonical = `${timestamp}\n${windowLine}${request.method.toUpperCase()}\n${percentDecode(urlObj.pathname)}\n${canonicalQuery}\n${bodyHash}`;
    const msgBytes = Uint8Array.from(canonical, (c) => c.charCodeAt(0));
    // Loaded on demand: browser clients authenticate with JWTs and never sign.
    const { signAsync } = await awaitWithSignal(import("@noble/ed25519"), signal);
    throwIfAborted(signal);
    const sig = await awaitWithSignal(signAsync(msgBytes, secretKey), signal);
    throwIfAborted(signal);
    const signatureHex = Array.from(sig, (b: number) => b.toString(16).padStart(2, "0")).join("");

    return {
        "X-API-KEY-ID": keyId,
        "X-API-TIMESTAMP": timestamp,
        ...(recvWindow === undefined ? {} : { "X-API-RECV-WINDOW": String(recvWindow) }),
        "X-API-SIGNATURE": signatureHex,
    };
}

/**
 * Resolves a JWT credential and translates provider failures or invalid values
 * into stable SDK errors.
 */
export async function resolveJwtToken(
    auth: JwtAuthProvider,
    signal?: AbortSignal,
): Promise<string | null> {
    throwIfAborted(signal);
    let token: string | null;
    try {
        const tokenOrPromise = auth.getToken();
        token = isPromiseLike(tokenOrPromise)
            ? await awaitWithSignal(tokenOrPromise, signal)
            : tokenOrPromise;
    } catch (cause) {
        if (signal?.aborted) throw abortReason(signal);
        if (cause instanceof PolyesterError) throw cause;
        throw new AuthenticationError("JWT token provider failed", { cause });
    }
    throwIfAborted(signal);
    if (token !== null && typeof token !== "string") {
        throw new ConfigurationError("JWT token provider must return a string or null");
    }
    return token;
}

/**
 * Creates an interceptor that attaches SDK authentication headers.
 */
export function createAuthInterceptor(
    auth: JwtAuthProvider | ApiKeyEd25519AuthProvider,
    options?: { wireFormat?: ConnectWireFormat },
): Interceptor {
    return (next) => async (req) => {
        throwIfAborted(req.signal);
        const wireFormat = options?.wireFormat ?? "binary";
        if (auth.kind === "jwt") {
            const token = await resolveJwtToken(auth, req.signal);
            if (token) {
                req.header.set("Authorization", `Bearer ${token}`);
            }
        } else if (auth.kind === "api-key-ed25519") {
            if (req.stream) {
                throw new ConfigurationError(
                    "API key authentication does not support streaming Connect RPCs",
                );
            }
            // Unary request: serialize the message using the method's input schema.
            const inputSchema = req.method.input;
            const bodyBytes =
                wireFormat === "json"
                    ? new TextEncoder().encode(toJsonString(inputSchema, req.message))
                    : toBinary(inputSchema, req.message);

            const headers = await createApiKeyEd25519AuthHeaders(auth, {
                url: req.url,
                method: req.requestMethod,
                body: bodyBytes,
                signal: req.signal,
            });
            for (const [key, value] of Object.entries(headers)) {
                req.header.set(key, value);
            }
        }
        throwIfAborted(req.signal);
        return next(req);
    };
}
