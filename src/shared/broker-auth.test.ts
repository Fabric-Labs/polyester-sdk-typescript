import {
    create,
    toBinary,
    toJsonString,
    type DescMessage,
    type MessageShape,
} from "@bufbuild/protobuf";
import { base64Encode } from "@bufbuild/protobuf/wire";
import { describe, expect, it, vi } from "vitest";
import { PolyesterBrowserClient } from "../browser-client.js";
import { PolyesterBrowserCore, type PolyesterBrowserClientConfig } from "../browser-core.js";
import { PolyesterClient } from "../client.js";
import type { PolyesterClientConfig } from "../core-client.js";
import { POLYESTER_DEVNET_ENVIRONMENT } from "../environment.js";
import { ListMyRewardAwardsResponseSchema } from "../gen/rewards/v1/rewards_pb.js";
import * as QuickSwapProto from "../gen/swap/quickswap/v1/quickswap_pb.js";
import { PolyesterServerClient } from "../server-client.js";
import { PolyesterServerCore } from "../server-core.js";
import { quickSwapService } from "../services/quickswap/service.js";
import { realtimeClientStub } from "../testing/service-harness.js";
import { formatId } from "../utils/base58-id.js";
import { BROKER_API_KEY_SERVICE_TYPE_NAME, type BrokerApiKeyAuthProvider } from "./broker-auth.js";
import {
    AlreadyExistsError,
    ConfigurationError,
    type PolyesterError,
    ServiceUnavailableError,
    ValidationError,
} from "./errors.js";

const KEY = `qsk_${"a".repeat(32)}_${"b".repeat(64)}`;
const brokerAuth: BrokerApiKeyAuthProvider = { kind: "broker-api-key", key: KEY };

const terms = {
    sourceZippedAssetId: 11,
    destinationZippedAssetId: 22,
    basis: "source_amount",
    amount: { baseUnits: "150000000", decimals: 8 },
    protection: { kind: "max_slippage", bps: 50 },
    execution: { type: "market" },
} as const;

function jsonResponse<Desc extends DescMessage>(schema: Desc, message: MessageShape<Desc>) {
    return new Response(toJsonString(schema, message), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

function quickSwapErrorResponse(
    status: number,
    code: string,
    detail: Parameters<typeof create<typeof QuickSwapProto.ErrorDetailSchema>>[1],
) {
    const value = toBinary(
        QuickSwapProto.ErrorDetailSchema,
        create(QuickSwapProto.ErrorDetailSchema, detail),
    );
    return new Response(
        JSON.stringify({
            code,
            message: "rejected",
            details: [
                {
                    type: QuickSwapProto.ErrorDetailSchema.typeName,
                    value: base64Encode(value, "std_raw"),
                },
            ],
        }),
        { status, headers: { "content-type": "application/json" } },
    );
}

function brokerClient(fetchImpl: typeof fetch) {
    return new PolyesterServerClient({
        environment: POLYESTER_DEVNET_ENVIRONMENT,
        auth: brokerAuth,
        wireFormat: "json",
        fetch: fetchImpl,
        realtimeClient: realtimeClientStub().realtime,
    });
}

function sentAuthorization(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, call = 0) {
    const init = fetchImpl.mock.calls[call]?.[1];
    return new Headers(init?.headers).get("authorization");
}

describe("broker API key auth", () => {
    it("pins the authenticated service to the generated QuickSwap descriptor", () => {
        expect(BROKER_API_KEY_SERVICE_TYPE_NAME).toBe(QuickSwapProto.QuickSwapService.typeName);
    });

    it("sends the key as a bearer token on QuickSwap requests", async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
            jsonResponse(
                QuickSwapProto.QuoteQuickSwapResponseSchema,
                create(QuickSwapProto.QuoteQuickSwapResponseSchema, {
                    quote: { minRate: "1.5", intermediateAssetId: 0 },
                }),
            ),
        );
        const client = brokerClient(fetchImpl);

        await expect(client.quickSwap.quote({ terms })).resolves.toMatchObject({
            minRate: "1.5",
        });

        expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
            `${POLYESTER_DEVNET_ENVIRONMENT.apiUrl}/swap.quickswap.v1.QuickSwapService/QuoteQuickSwap`,
        );
        expect(sentAuthorization(fetchImpl)).toBe(`Bearer ${KEY}`);
    });

    it("never sends the key to other services or treats it as a user session", async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                jsonResponse(
                    ListMyRewardAwardsResponseSchema,
                    create(ListMyRewardAwardsResponseSchema, {}),
                ),
            );
        const client = brokerClient(fetchImpl);

        await client.rewards.listAwards();

        expect(sentAuthorization(fetchImpl)).toBeNull();
        expect(client.hasAuthProvider).toBe(false);
        await expect(client.verifySession()).resolves.toBeNull();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it.each([
        {
            name: "an idempotency conflict",
            response: () =>
                quickSwapErrorResponse(409, "already_exists", {
                    code: QuickSwapProto.ErrorCode.IDEMPOTENCY_CONFLICT,
                    swapId: 42n,
                }),
            errorClass: AlreadyExistsError,
            detail: { code: "IDEMPOTENCY_CONFLICT", swapId: formatId(42n) },
        },
        {
            name: "an amount out of range",
            response: () =>
                quickSwapErrorResponse(400, "invalid_argument", {
                    code: QuickSwapProto.ErrorCode.AMOUNT_OUT_OF_RANGE,
                    minDepositAmount: { baseUnits: "100000", decimals: 8 },
                    maxDepositAmount: { baseUnits: "500000000", decimals: 8 },
                }),
            errorClass: ValidationError,
            detail: {
                code: "AMOUNT_OUT_OF_RANGE",
                minDepositAmount: { baseUnits: "100000", decimals: 8 },
                maxDepositAmount: { baseUnits: "500000000", decimals: 8 },
            },
        },
        {
            name: "an unavailable deposit address",
            response: () =>
                quickSwapErrorResponse(503, "unavailable", {
                    code: QuickSwapProto.ErrorCode.ADDRESS_UNAVAILABLE,
                    swapId: 7n,
                }),
            errorClass: ServiceUnavailableError,
            detail: { code: "ADDRESS_UNAVAILABLE", swapId: formatId(7n) },
        },
    ])("surfaces $name with its typed detail", async ({ response, errorClass, detail }) => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response());
        const client = brokerClient(fetchImpl);

        const error = await client.quickSwap
            .create({
                idempotencyKey: "order-1",
                terms,
                destinationAddress: "d",
                returnAddress: "r",
            })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(errorClass);
        expect((error as PolyesterError).detail).toMatchObject({ service: "quickswap", ...detail });
        expect(JSON.stringify(error)).not.toContain(KEY);
        expect(String((error as Error).stack)).not.toContain(KEY);
    });

    it.each([
        { name: "an empty key", key: "" },
        { name: "a key with a line break", key: `${KEY}\n` },
        { name: "a key with a space", key: `${KEY} x` },
        { name: "a non-string key", key: 42 as unknown as string },
    ])("rejects $name at construction without echoing it", ({ key }) => {
        const construct = () =>
            new PolyesterServerClient({
                environment: POLYESTER_DEVNET_ENVIRONMENT,
                auth: { kind: "broker-api-key", key },
            });

        expect(construct).toThrow(ConfigurationError);
        try {
            construct();
        } catch (error) {
            if (key) expect((error as Error).message).not.toContain(String(key).trim());
        }
    });
});

describe("server-only QuickSwap", () => {
    it("exists on the server client only", () => {
        expect("quickSwap" in PolyesterServerClient.prototype).toBe(true);
        expect("quickSwap" in PolyesterBrowserClient.prototype).toBe(false);
        expect("quickSwap" in PolyesterClient.prototype).toBe(false);
    });

    it("refuses non-server cores at runtime", () => {
        const browserCore = new PolyesterBrowserCore({ environment: POLYESTER_DEVNET_ENVIRONMENT });

        // @ts-expect-error The accessor only accepts server cores.
        expect(() => quickSwapService(browserCore)).toThrow(ConfigurationError);
        expect(
            quickSwapService(
                new PolyesterServerCore({ environment: POLYESTER_DEVNET_ENVIRONMENT }),
            ),
        ).toBeDefined();
    });

    it("keeps the broker provider out of the browser and base client configs", () => {
        const browserConfig: PolyesterBrowserClientConfig = {
            environment: POLYESTER_DEVNET_ENVIRONMENT,
            // @ts-expect-error Browser clients authenticate with an account signer only.
            auth: brokerAuth,
        };
        const baseConfig: PolyesterClientConfig = {
            environment: POLYESTER_DEVNET_ENVIRONMENT,
            // @ts-expect-error Broker keys are server credentials.
            auth: brokerAuth,
        };
        // @ts-expect-error Browser clients have no QuickSwap getter.
        void ((client: PolyesterBrowserClient) => client.quickSwap);
        expect([browserConfig, baseConfig]).toHaveLength(2);
    });
});
