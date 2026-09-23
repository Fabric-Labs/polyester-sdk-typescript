import {
    Code,
    ConnectError,
    createClient,
    type Interceptor,
    type Transport,
} from "@connectrpc/connect";
import { create, toJsonString } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signAsync } from "@noble/ed25519";
import { RateLimitService } from "../gen/ratelimit/v1/ratelimit_pb.js";
import { createErrorMappingTransport } from "./connect-error-mapping.js";
import * as Proto from "../gen/marketoverview/v1/marketoverview_pb.js";
import { formatUserFacingError, isRetryableError } from "../utils/errors.js";
import {
    AuthenticationError,
    ConfigurationError,
    InternalServerError,
    NetworkError,
    NotImplementedError,
    PolyesterError,
    PreconditionFailedError,
    RateLimitError,
    TimeoutError,
    TransientError,
    ValidationError,
} from "./errors.js";
import {
    createApiKeyEd25519AuthHeaders,
    createTransports,
    isAbortError,
    makeFetch,
} from "./transports.js";

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("makeFetch", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("rethrows abort errors unchanged", async () => {
        const abortError = new DOMException("Request aborted", "AbortError");
        vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

        await expect(makeFetch()("https://api.test")).rejects.toBe(abortError);
        expect(isAbortError(abortError)).toBe(true);
    });

    it("wraps transport failures with the original cause", async () => {
        const cause = new TypeError("Failed to fetch");
        vi.spyOn(globalThis, "fetch").mockRejectedValue(cause);

        const rejection = expect(makeFetch()("https://api.test")).rejects;
        await rejection.toBeInstanceOf(NetworkError);
        await rejection.toMatchObject({
            name: "NetworkError",
            code: "NETWORK_ERROR",
            retryable: true,
            message: "Transport request failed",
            cause,
        });
    });

    it("passes through real HTTP 500 responses", async () => {
        const response = new Response("Backend failed", { status: 500 });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

        await expect(makeFetch()("https://api.test")).resolves.toBe(response);
    });
});

describe("createTransports", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("preserves mapped SDK errors outside Connect's call runner", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({ code: "unauthenticated", message: "Authentication required." }),
                { status: 401, headers: { "content-type": "application/json" } },
            ),
        );
        const { publicApi } = createTransports({ apiUrl: "https://api.test" });
        const client = createClient(Proto.MarketOverviewService, publicApi);

        const rejection = expect(client.listMarketOverview({})).rejects;
        await rejection.toBeInstanceOf(AuthenticationError);
        await rejection.toBeInstanceOf(PolyesterError);
    });

    it.each([
        [400, ValidationError],
        [404, NotImplementedError],
        [408, TimeoutError],
        [412, PreconditionFailedError],
        [500, InternalServerError],
        [501, NotImplementedError],
    ])("maps bare HTTP %i responses by status", async (status, expected) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("nope", { status, headers: { "content-type": "text/plain" } }),
        );
        const { publicApi } = createTransports({ apiUrl: "https://api.test" });
        const client = createClient(Proto.MarketOverviewService, publicApi);

        await expect(client.listMarketOverview({})).rejects.toBeInstanceOf(expected);
    });

    it("maps bare HTTP 429 responses to RateLimitError with retry-after", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(null, { status: 429, headers: { "retry-after": "2" } }),
        );
        const { publicApi } = createTransports({ apiUrl: "https://api.test" });
        const client = createClient(Proto.MarketOverviewService, publicApi);

        const rejection = expect(client.listMarketOverview({})).rejects;
        await rejection.toBeInstanceOf(RateLimitError);
        await rejection.toMatchObject({ retryAfterMs: 2000 });
    });

    it("preserves SDK network errors outside Connect's call runner", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
        const { publicApi } = createTransports({ apiUrl: "https://api.test" });
        const client = createClient(Proto.MarketOverviewService, publicApi);

        const rejection = expect(client.listMarketOverview({})).rejects;
        await rejection.toBeInstanceOf(NetworkError);
        await rejection.toBeInstanceOf(PolyesterError);
    });

    it("maps JWT provider failures to AuthenticationError", async () => {
        const cause = new Error("credential store unavailable");
        const { authApi } = createTransports({
            apiUrl: "https://api.test",
            auth: {
                kind: "jwt",
                getToken: () => {
                    throw cause;
                },
            },
        });
        const client = createClient(Proto.MarketOverviewService, authApi);

        await expect(client.listMarketOverview({})).rejects.toMatchObject({
            name: "AuthenticationError",
            code: "UNAUTHENTICATED",
            cause,
        });
    });

    it("makes JWT authentication visible to user interceptors", async () => {
        let observedAuthorization: string | null = null;
        let sentAuthorization: string | null = null;
        const inspectAndOverrideAuth: Interceptor = (next) => async (request) => {
            observedAuthorization = request.header.get("Authorization");
            request.header.set("Authorization", "Bearer overridden");
            return next(request);
        };
        vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
            sentAuthorization = new Headers(init?.headers).get("Authorization");
            return new Response(JSON.stringify({ markets: [] }), {
                headers: { "content-type": "application/json" },
            });
        });
        const { authApi } = createTransports({
            apiUrl: "https://api.test",
            wireFormat: "json",
            interceptors: [inspectAndOverrideAuth],
            auth: {
                kind: "jwt",
                getToken: () => "secret",
            },
        });
        const client = createClient(Proto.MarketOverviewService, authApi);

        await client.listMarketOverview({});

        expect(observedAuthorization).toBe("Bearer secret");
        expect(sentAuthorization).toBe("Bearer overridden");
    });

    it("rejects invalid API key material as an SDK configuration error", async () => {
        const { authApi } = createTransports({
            apiUrl: "https://api.test",
            auth: {
                kind: "api-key-ed25519",
                getKeyId: () => "ak_test",
                getSecretKey: () => new Uint8Array(64),
            },
        });
        const client = createClient(Proto.MarketOverviewService, authApi);

        await expect(client.listMarketOverview({})).rejects.toBeInstanceOf(ConfigurationError);
        await expect(client.listMarketOverview({})).rejects.toThrow(
            "API key secret key must contain exactly 32 bytes",
        );
    });

    it("signs the request after user interceptors finish mutating its message", async () => {
        const secretKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
        const mutateMessage: Interceptor = (next) => async (request) => {
            if (
                !request.stream &&
                "symbolId" in request.message &&
                Array.isArray(request.message.symbolId)
            ) {
                request.message.symbolId.push(42);
            }
            return next(request);
        };
        let capturedHeaders: Headers | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
            capturedHeaders = new Headers(init?.headers);
            return new Response(JSON.stringify({ markets: [] }), {
                headers: { "content-type": "application/json" },
            });
        });
        const { authApi } = createTransports({
            apiUrl: "https://api.test",
            wireFormat: "json",
            interceptors: [mutateMessage],
            auth: {
                kind: "api-key-ed25519",
                getKeyId: () => "ak_test",
                getSecretKey: () => secretKey,
            },
        });
        const client = createClient(Proto.MarketOverviewService, authApi);

        await client.listMarketOverview({ symbolId: [1] });

        const timestamp = capturedHeaders?.get("X-API-TIMESTAMP");
        if (!timestamp) throw new Error("Expected API key timestamp header");
        const body = new TextEncoder().encode(
            toJsonString(
                Proto.ListMarketOverviewRequestSchema,
                create(Proto.ListMarketOverviewRequestSchema, { symbolId: [1, 42] }),
            ),
        );
        const hash = await crypto.subtle.digest("SHA-256", body);
        const canonical = `${timestamp}\nPOST\n/marketoverview.v1.MarketOverviewService/ListMarketOverview\n\n${bytesToHex(
            new Uint8Array(hash),
        )}`;
        const expectedSignature = bytesToHex(
            await signAsync(new TextEncoder().encode(canonical), secretKey),
        );

        expect(capturedHeaders?.get("X-API-SIGNATURE")).toBe(expectedSignature);
    });
});

describe("createApiKeyEd25519AuthHeaders", () => {
    it("signs the canonical request with API-key credentials", async () => {
        const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
        const body = new TextEncoder().encode("body");
        const hash = await crypto.subtle.digest("SHA-256", body.slice());
        const bodyHash = bytesToHex(new Uint8Array(hash));
        const canonical = `1234567890\nGET\n/v1/rt/subscribe\na=1&b=2&channel=private%3Atest\n${bodyHash}`;
        const expectedSignature = bytesToHex(
            await signAsync(new TextEncoder().encode(canonical), secretKey),
        );

        const headers = await createApiKeyEd25519AuthHeaders(
            {
                kind: "api-key-ed25519",
                getKeyId: () => "ak_test",
                getSecretKey: () => secretKey,
            },
            {
                url: "https://api.example.test/v1/rt/subscribe?b=2&channel=private:test&a=1",
                method: "GET",
                body,
                timestamp: "1234567890",
            },
        );

        expect(headers).toEqual({
            "X-API-KEY-ID": "ak_test",
            "X-API-TIMESTAMP": "1234567890",
            "X-API-SIGNATURE": expectedSignature,
        });
    });

    it("allocates strictly increasing timestamps for concurrent requests", async () => {
        const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
        const auth = {
            kind: "api-key-ed25519",
            getKeyId: () => "ak_test",
            getSecretKey: () => secretKey,
        } as const;
        const request = { url: "https://api.example.test/v1/rt/token", method: "GET" };

        const headers = await Promise.all(
            Array.from({ length: 5 }, () => createApiKeyEd25519AuthHeaders(auth, request)),
        );

        const timestamps = headers.map((h) => Number(h["X-API-TIMESTAMP"]));
        for (let i = 1; i < timestamps.length; i++) {
            expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]!);
        }
    });

    it("rejects missing API-key credentials", async () => {
        await expect(
            createApiKeyEd25519AuthHeaders(
                {
                    kind: "api-key-ed25519",
                    getKeyId: () => null,
                    getSecretKey: () => null,
                },
                { url: "https://api.example.test/v1/rt/token", method: "GET" },
            ),
        ).rejects.toThrow("Missing API key ID or secret key");
    });
});

describe("isRetryableError", () => {
    it("does not retry abort errors", () => {
        const abortError = new DOMException("Request aborted", "AbortError");

        expect(isRetryableError(abortError)).toBe(false);
    });

    it("retries network errors", () => {
        const err = new NetworkError("Transport request failed", {
            cause: new TypeError("Failed to fetch"),
        });

        expect(err).toBeInstanceOf(TransientError);
        expect(isRetryableError(err)).toBe(true);
    });
});

describe("caller cancellation through transports", () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(["default", "custom", "pre", "timeout", "api-key", "jwt-pre"] as const)(
        "classifies %s cancellation without retrying",
        async (kind) => {
            const controller = new AbortController();
            const preAborted = kind === "pre" || kind === "jwt-pre";
            if (preAborted) controller.abort();
            const signal = kind === "timeout" ? AbortSignal.timeout(10) : controller.signal;
            let fetchAborted = false;
            const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
                (_input, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        const fetchSignal = init!.signal!;
                        const abort = () => {
                            fetchAborted = true;
                            reject(fetchSignal.reason);
                        };
                        if (fetchSignal.aborted) abort();
                        else fetchSignal.addEventListener("abort", abort, { once: true });
                        if (kind !== "timeout") {
                            queueMicrotask(() => {
                                if (kind === "custom") controller.abort(new Error("route change"));
                                else controller.abort();
                            });
                        }
                    }),
            );
            const getToken = vi.fn(() => "fixture-token");
            const transports = createTransports({
                apiUrl: "https://api.test",
                auth:
                    kind === "api-key"
                        ? {
                              kind: "api-key-ed25519",
                              getKeyId: () => "fixture-key",
                              getSecretKey: () => new Uint8Array(32).fill(1),
                          }
                        : { kind: "jwt", getToken },
            });
            const client = createClient(
                RateLimitService,
                kind === "api-key" || kind === "jwt-pre"
                    ? transports.authApi
                    : transports.publicApi,
            );
            const error = await client
                .getRateLimitConfig({}, { signal })
                .catch((error: unknown) => error);
            expect(isAbortError(error)).toBe(true);
            expect(isRetryableError(error)).toBe(false);
            expect(error).not.toBeInstanceOf(ConfigurationError);
            expect(formatUserFacingError(error, "Backend failed.")).toBe("Request canceled.");
            expect(fetchMock).toHaveBeenCalledTimes(preAborted ? 0 : 1);
            expect(fetchAborted).toBe(!preAborted);
            if (kind === "jwt-pre") expect(getToken).not.toHaveBeenCalled();
            if (kind === "default" || preAborted) expect(error).toBe(signal.reason);
        },
    );

    it("does not classify a server cancellation as a caller abort", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ code: "canceled", message: "Server canceled." }), {
                status: 499,
                headers: { "content-type": "application/json" },
            }),
        );
        const { publicApi } = createTransports({ apiUrl: "https://api.test" });
        const client = createClient(RateLimitService, publicApi);
        const error = await client
            .getRateLimitConfig({}, { signal: new AbortController().signal })
            .catch((error: unknown) => error);
        expect(error).toBeInstanceOf(ConnectError);
        expect(isAbortError(error)).toBe(false);
        expect(isRetryableError(error)).toBe(false);
    });

    it("normalizes cancellation while consuming a stream", async () => {
        const controller = new AbortController();
        const transport: Transport = {
            unary: vi.fn(),
            async stream(method) {
                return {
                    stream: true,
                    service: method.parent,
                    method,
                    header: new Headers(),
                    trailer: new Headers(),
                    message: (async function* () {
                        yield create(method.output);
                        controller.abort(new Error("route change"));
                        throw new ConnectError("canceled", Code.Canceled);
                    })(),
                };
            },
        };
        const response = await createErrorMappingTransport(transport).stream(
            { ...RateLimitService.method.getRateLimitConfig, methodKind: "server_streaming" },
            controller.signal,
            undefined,
            undefined,
            (async function* () {})(),
        );
        const iterator = response.message[Symbol.asyncIterator]();
        expect((await iterator.next()).done).toBe(false);
        const error = await iterator.next().catch((error: unknown) => error);
        expect(isAbortError(error)).toBe(true);
        expect(isRetryableError(error)).toBe(false);
    });
});
