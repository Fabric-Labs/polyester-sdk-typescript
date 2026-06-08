import { createConnectTransport } from "@connectrpc/connect-web";
import type { Transport, Interceptor } from "@connectrpc/connect";
import { toBinary, toJsonString } from "@bufbuild/protobuf";
import { signAsync } from "@noble/ed25519";

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
}

export interface Transports {
    authApi: Transport;
    publicApi: Transport;
}

/**
 * Generic JWT auth for HTTP/Connect endpoints that follow the Bearer token contract.
 */
export interface JwtAuthProvider {
    kind: "jwt";
    /** Typically wraps the configured browser auth token storage. */
    getToken: () => string | null | Promise<string | null>;
}

/**
 * Generic Ed25519 API key auth for HTTP/Connect endpoints that follow the
 * X-API-KEY-ID / X-API-TIMESTAMP / X-API-SIGNATURE contract.
 */
export interface ApiKeyEd25519AuthProvider {
    kind: "api-key-ed25519";
    getKeyId: () => string | null | Promise<string | null>;
    /** Ed25519 secret key bytes (not hex) for signing. */
    getSecretKey: () => Uint8Array | null | Promise<Uint8Array | null>;
}

/**
 * Error wrapper used when an SDK transport request fails before Connect can return a normal RPC error.
 */
export class TransportError extends Error {
    constructor(message: string, options: { cause: unknown }) {
        super(message, { cause: options.cause });
        this.name = "TransportError";
    }
}

/**
 * Checks whether an error represents an aborted request.
 */
export function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Returns the fetch implementation used by SDK transports.
 */
export function makeFetch(): typeof fetch {
    const wrappedFetch = Object.assign(
        async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
            // Normalize headers into a mutable Headers object
            const headers = new Headers(init?.headers);

            try {
                const res = await fetch(input, {
                    ...init,
                    headers,
                    redirect: "manual",
                });

                return res;
            } catch (err) {
                if (isAbortError(err)) throw err;
                throw new TransportError("Transport request failed", { cause: err });
            }
        },
        fetch,
    );

    return wrappedFetch;
}

/**
 * Creates Connect transports for SDK service clients.
 */
export function createTransports(config: TransportConfig): Transports {
    const { apiUrl, interceptors = [], auth, wireFormat = "binary" } = config;
    const useBinaryFormat = wireFormat === "binary";

    const publicApi = createConnectTransport({
        baseUrl: apiUrl,
        useBinaryFormat,
        interceptors,
        fetch: makeFetch(),
    });

    const authInterceptors = auth
        ? [createAuthInterceptor(auth, { wireFormat }), ...interceptors]
        : interceptors;
    const authApi = createConnectTransport({
        baseUrl: apiUrl,
        useBinaryFormat,
        interceptors: authInterceptors,
        fetch: makeFetch(),
    });

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
        throw new Error("SHA-256 not available in this environment");
    }
    const hash = await crypto.subtle.digest("SHA-256", bytes.slice());
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates an interceptor that attaches SDK authentication headers.
 */
export function createAuthInterceptor(
    auth: JwtAuthProvider | ApiKeyEd25519AuthProvider,
    options?: { wireFormat?: ConnectWireFormat },
): Interceptor {
    return (next) => async (req) => {
        const wireFormat = options?.wireFormat ?? "binary";
        if (auth.kind === "jwt") {
            const token = await auth.getToken();
            if (token) {
                req.header.set("Authorization", `Bearer ${token}`);
            }
        } else if (auth.kind === "api-key-ed25519") {
            const [keyId, secretKey] = await Promise.all([auth.getKeyId(), auth.getSecretKey()]);
            if (!keyId || !secretKey) throw new Error("Missing API key ID or secret key");
            const urlObj = new URL(req.url);
            const method = req.requestMethod;
            const timestamp = String(Date.now());

            let bodyBytes: Uint8Array;
            if (!req.stream) {
                // unary request - serialize the message using the method's input schema
                const inputSchema = req.method.input;
                bodyBytes =
                    wireFormat === "json"
                        ? new TextEncoder().encode(toJsonString(inputSchema, req.message))
                        : toBinary(inputSchema, req.message);
            } else {
                // stream request - empty body for signing (streams don't have a single body)
                bodyBytes = new Uint8Array(0);
            }

            const bodyHash = await sha256Hex(bodyBytes);

            // build canonical query string
            const params = urlObj.searchParams;
            const pairs: string[] = [];
            for (const [k, v] of params.entries()) {
                pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
            }
            pairs.sort();
            const canonicalQuery = pairs.join("&");

            // build canonical string for signing
            const canonical = `${timestamp}\n${method}\n${urlObj.pathname}\n${canonicalQuery}\n${bodyHash}`;

            // sign with Ed25519
            const msgBytes = new TextEncoder().encode(canonical);
            const sig = await signAsync(msgBytes, secretKey);
            const signatureHex = Array.from(sig, (b: number) =>
                b.toString(16).padStart(2, "0"),
            ).join("");

            // set auth headers
            req.header.set("X-API-KEY-ID", keyId);
            req.header.set("X-API-TIMESTAMP", timestamp);
            req.header.set("X-API-SIGNATURE", signatureHex);
        }
        return next(req);
    };
}
