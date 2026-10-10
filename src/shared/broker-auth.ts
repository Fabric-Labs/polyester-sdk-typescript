import type { Interceptor } from "@connectrpc/connect";
import { ConfigurationError } from "./errors.js";

/**
 * The only service that accepts a broker API key. A literal rather than the
 * generated descriptor, so server cores that never call QuickSwap don't bundle it.
 */
export const BROKER_API_KEY_SERVICE_TYPE_NAME = "swap.quickswap.v1.QuickSwapService";

/** RFC 6750 bearer token syntax; anything else cannot travel in a header unchanged. */
const BEARER_TOKEN_RE = /^[A-Za-z0-9\-._~+/]+=*$/u;

/**
 * Broker API key auth for the QuickSwap broker API, sent as
 * `Authorization: Bearer <key>`. Polyester issues the key at broker onboarding.
 *
 * The key is a server credential: only `PolyesterServerClient` and
 * `PolyesterServerCore` accept this provider, and the SDK attaches the key to
 * QuickSwap requests only. Every other service on that client is called without
 * credentials.
 */
export interface BrokerApiKeyAuthProvider {
    kind: "broker-api-key";
    /** The broker API key. Never logged or included in SDK error messages. */
    key: string;
}

/**
 * Validates a broker key provider and returns the interceptor that authenticates
 * QuickSwap requests with it.
 */
export function createBrokerApiKeyInterceptor(auth: BrokerApiKeyAuthProvider): Interceptor {
    const key: unknown = auth.key;
    // The messages never echo the key, so a misconfigured secret cannot leak into logs.
    if (typeof key !== "string" || key.length === 0) {
        throw new ConfigurationError("Broker API key must be a non-empty string.");
    }
    if (!BEARER_TOKEN_RE.test(key)) {
        throw new ConfigurationError(
            "Broker API key contains characters that are not valid in a bearer token.",
        );
    }
    const authorization = `Bearer ${key}`;
    return (next) => async (req) => {
        if (req.service.typeName === BROKER_API_KEY_SERVICE_TYPE_NAME) {
            req.header.set("Authorization", authorization);
        }
        return next(req);
    };
}
