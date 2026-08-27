import { createConnectTransport } from "@connectrpc/connect-web";
import type { Transport, Interceptor } from "@connectrpc/connect";
import { toBinary, toJsonString } from "@bufbuild/protobuf";
import { signAsync } from "@noble/ed25519";
import { createErrorMappingTransport } from "./connect-error-mapping.js";
import {
    AuthenticationError,
    ConfigurationError,
    isAbortError,
    NetworkError,
    PolyesterError,
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

export interface ApiKeyEd25519SigningRequest {
    url: string | URL;
    method: string;
    body?: Uint8Array;
    timestamp?: string;
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
                throw new NetworkError("Transport request failed", { cause: err });
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
    const publicApi = createErrorMappingTransport(
        createConnectTransport({
            baseUrl: apiUrl,
            useBinaryFormat,
            interceptors,
            fetch: makeFetch(),
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
            fetch: makeFetch(),
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

let lastTimestamp = 0;
function nextTimestamp(): string {
    lastTimestamp = Math.max(lastTimestamp + 1, Date.now());
    return String(lastTimestamp);
}

function canonicalQueryString(params: URLSearchParams): string {
    const pairs: string[] = [];
    for (const [k, v] of params.entries()) {
        pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
    pairs.sort();
    return pairs.join("&");
}

/**
 * Creates API-key authentication headers for endpoints using the Polyester Ed25519 signing contract.
 */
export async function createApiKeyEd25519AuthHeaders(
    auth: ApiKeyEd25519AuthProvider,
    request: ApiKeyEd25519SigningRequest,
): Promise<Record<string, string>> {
    let keyId: string | null;
    let secretKey: Uint8Array | null;
    try {
        [keyId, secretKey] = await Promise.all([auth.getKeyId(), auth.getSecretKey()]);
    } catch (cause) {
        if (cause instanceof PolyesterError) throw cause;
        throw new ConfigurationError("API key credential provider failed", { cause });
    }
    if (!keyId || !secretKey) throw new ConfigurationError("Missing API key ID or secret key");
    if (!(secretKey instanceof Uint8Array) || secretKey.byteLength !== 32) {
        throw new ConfigurationError("API key secret key must contain exactly 32 bytes");
    }

    const urlObj = new URL(request.url);
    const timestamp = request.timestamp ?? nextTimestamp();
    const bodyHash = await sha256Hex(request.body ?? new Uint8Array(0));
    const canonicalQuery = canonicalQueryString(urlObj.searchParams);
    const canonical = `${timestamp}\n${request.method}\n${urlObj.pathname}\n${canonicalQuery}\n${bodyHash}`;
    const msgBytes = new TextEncoder().encode(canonical);
    const sig = await signAsync(msgBytes, secretKey);
    const signatureHex = Array.from(sig, (b: number) => b.toString(16).padStart(2, "0")).join("");

    return {
        "X-API-KEY-ID": keyId,
        "X-API-TIMESTAMP": timestamp,
        "X-API-SIGNATURE": signatureHex,
    };
}

/**
 * Resolves a JWT credential and translates provider failures or invalid values
 * into stable SDK errors.
 */
export async function resolveJwtToken(auth: JwtAuthProvider): Promise<string | null> {
    let token: string | null;
    try {
        token = await auth.getToken();
    } catch (cause) {
        if (cause instanceof PolyesterError) throw cause;
        throw new AuthenticationError("JWT token provider failed", { cause });
    }
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
        const wireFormat = options?.wireFormat ?? "binary";
        if (auth.kind === "jwt") {
            const token = await resolveJwtToken(auth);
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
            });
            for (const [key, value] of Object.entries(headers)) {
                req.header.set(key, value);
            }
        }
        return next(req);
    };
}
