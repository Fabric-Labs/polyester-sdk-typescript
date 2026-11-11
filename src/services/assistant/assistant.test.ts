import type { MessageInitShape } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";
import * as Alerts from "../../gen/alerts/v1/price_alerts_pb.js";
import * as Proto from "../../gen/ai/v1/assistant_pb.js";
import { Side, TimeInForce } from "../../gen/orders/v1/orders_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import { ServiceUnavailableError, ValidationError } from "../../shared/errors.js";
import { unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { AssistantService } from "./assistant.js";
import type { AssistantRunEvent } from "./assistant.types.js";

const scales = {
    ready: vi.fn(async () => {}),
    price: () => 9,
    baseQty: () => {
        throw new Error("symbol not in catalog");
    },
    quoteAmount: () => 6,
    ledgerAmount: () => 18,
    zippedAssetAmount: () => 18,
    marketDataVolume: () => 6,
    referencePrice: () => 9,
} satisfies SdkScales;

const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

function serviceWith(response: Record<string, unknown>) {
    const transport = unaryTransport(response);
    return { transport, service: new AssistantService({ authApi: transport.transport }, scales) };
}

async function collect(stream: AsyncIterable<AssistantRunEvent>) {
    const events: AssistantRunEvent[] = [];
    for await (const event of stream) events.push(event);
    return events;
}

describe("AssistantService unary calls", () => {
    it("sends a message with public IDs and destinations", async () => {
        const { transport, service } = serviceWith({ runId: 7n, conversationId: 8n });

        const result = await service.sendMessage({
            conversationId: formatId(8n),
            text: "buy 1 SOL",
            idempotencyKey: " key-1 ",
            subaccountId: formatId(42n),
            destinations: [{ id: "page-subaccounts", title: "Subaccounts" }],
        });

        expect(result).toEqual({ runId: formatId(7n), conversationId: formatId(8n) });
        expect(transport.lastCall()?.method.localName).toBe("sendMessage");
        expect(transport.lastCall()?.message).toEqual({
            conversationId: 8n,
            text: "buy 1 SOL",
            idempotencyKey: "key-1",
            subaccountId: 42n,
            destinations: [{ id: "page-subaccounts", title: "Subaccounts", description: "" }],
        });
    });

    it.each([
        [{ text: "", idempotencyKey: "k" }],
        [{ text: "hi", idempotencyKey: " " }],
        [
            {
                text: "hi",
                idempotencyKey: "k",
                destinations: [
                    { id: "a", title: "A" },
                    { id: "a", title: "B" },
                ],
            },
        ],
        [{ text: "hi", idempotencyKey: "k", destinations: [{ id: "Bad Id", title: "A" }] }],
    ])("rejects invalid message input %#", async (input) => {
        const { service } = serviceWith({});
        await expect(service.sendMessage(input)).rejects.toBeInstanceOf(ValidationError);
    });

    it("decides approvals and returns the recorded status", async () => {
        const { transport, service } = serviceWith({ status: Proto.ApprovalStatus.REJECTED });

        await expect(
            service.decideApproval({ approvalId: formatId(5n), decision: "reject" }),
        ).resolves.toBe("rejected");
        expect(transport.lastCall()?.message).toEqual({
            approvalId: 5n,
            decision: Proto.ApprovalDecision.REJECT,
        });
    });

    it("pages conversations, messages and memories", async () => {
        const { transport, service } = serviceWith({
            conversations: [
                { conversationId: 1n, title: "SOL", createdAt: ts(1), updatedAt: ts(2) },
            ],
            messages: [
                {
                    messageId: 2n,
                    role: Proto.MessageRole.ASSISTANT,
                    text: "Done",
                    createdAt: ts(3),
                    runId: 4n,
                },
            ],
            memories: [
                {
                    memoryId: 9n,
                    text: "likes SOL",
                    kind: Proto.MemoryKind.PROFILE,
                    createdAt: ts(4),
                },
            ],
            nextPageToken: "next",
        });

        await expect(service.listConversations({ limit: 10 })).resolves.toEqual({
            conversations: [
                { conversationId: formatId(1n), title: "SOL", createdAt: 1000, updatedAt: 2000 },
            ],
            nextPageToken: "next",
        });
        expect(transport.lastCall()?.message).toEqual({ limit: 10 });

        await expect(
            service.listMessages({ conversationId: formatId(1n), pageToken: "p" }),
        ).resolves.toEqual({
            messages: [
                {
                    messageId: formatId(2n),
                    role: "assistant",
                    text: "Done",
                    createdAt: 3000,
                    runId: formatId(4n),
                },
            ],
            nextPageToken: "next",
        });
        expect(transport.lastCall()?.message).toEqual({ conversationId: 1n, pageToken: "p" });

        await expect(service.listMemories()).resolves.toEqual({
            memories: [
                {
                    memoryId: formatId(9n),
                    text: "likes SOL",
                    createdAt: 4000,
                    conversationId: undefined,
                    kind: "profile",
                },
            ],
            nextPageToken: "next",
        });
    });

    it("prepares keys with hex public keys and refuses duplicate accounts", async () => {
        const publicKey = new Uint8Array(32).fill(1);
        const proof = new Uint8Array(64).fill(2);
        const { transport, service } = serviceWith({
            setupId: 3n,
            keys: [
                {
                    subaccountId: 42n,
                    publicKeyEd25519: publicKey,
                    registrationProof: proof,
                    registrationDeadline: ts(10),
                },
            ],
            expiresAt: ts(10),
        });

        const result = await service.prepareKeys({
            accounts: [{}, { subaccountId: formatId(42n) }],
        });
        expect(transport.lastCall()?.message).toEqual({ accounts: [{}, { subaccountId: 42n }] });
        expect(result).toEqual({
            setupId: formatId(3n),
            keys: [
                {
                    subaccountId: formatId(42n),
                    publicKeyEd25519: publicKey,
                    publicKeyHex: "01".repeat(32),
                    registrationProof: proof,
                    registrationDeadline: 10_000,
                },
            ],
            expiresAt: 10_000,
        });

        await expect(service.prepareKeys({ accounts: [{}, {}] })).rejects.toBeInstanceOf(
            ValidationError,
        );
    });

    it("lists the keys the assistant holds", async () => {
        const { service } = serviceWith({
            keys: [
                {
                    keyId: "ak_1",
                    publicKeyEd25519: new Uint8Array([0xab]),
                    state: Proto.AssistantKeyState.ACTIVE,
                },
            ],
        });

        await expect(service.listKeys()).resolves.toEqual([
            {
                subaccountId: undefined,
                keyId: "ak_1",
                publicKeyEd25519: new Uint8Array([0xab]),
                publicKeyHex: "ab",
                state: "active",
            },
        ]);
    });
});

describe("AssistantService.watchRun", () => {
    function streamingService(
        events: MessageInitShape<typeof Proto.RunEventSchema>[],
        failAfter?: ConnectError,
    ) {
        const requests: Proto.WatchRunRequest[] = [];
        const transport = createRouterTransport((router) =>
            router.service(Proto.AssistantService, {
                async *watchRun(request) {
                    requests.push(request);
                    for (const event of events) yield { event };
                    if (failAfter) throw failAfter;
                },
            }),
        );
        return {
            requests,
            service: new AssistantService(
                { authApi: createErrorMappingTransport(transport) },
                scales,
            ),
        };
    }

    it("streams typed events from afterSeq and skips unknown cases", async () => {
        const { requests, service } = streamingService([
            { seq: 3n, createdAt: ts(1), event: { case: "textDelta", value: { text: "Hi" } } },
            {
                seq: 4n,
                event: {
                    case: "toolStarted",
                    value: { toolCallId: "t1", name: "get_candles", input: { symbol: "SOL" } },
                },
            },
            {
                seq: 5n,
                event: {
                    case: "approvalRequested",
                    value: {
                        approvalId: 11n,
                        summary: "Buy 1 SOL at 150",
                        accountId: 42n,
                        parameters: [{ label: "Price", value: "150 USDT" }],
                        preview: {
                            case: "orderPreview",
                            value: {
                                symbolId: 1,
                                symbol: "SOL-USDT",
                                baseAsset: "SOL",
                                quoteAsset: "USDT",
                                side: Side.BUY,
                                quantity: "1",
                                kind: {
                                    case: "limit",
                                    value: {
                                        price: "150",
                                        timeInForce: TimeInForce.GTC,
                                        postOnly: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
            {
                seq: 6n,
                event: {
                    case: "view",
                    value: {
                        kind: {
                            case: "priceAlert",
                            value: {
                                alertId: 9n,
                                symbolId: 1,
                                direction: Alerts.AlertDirection.ABOVE,
                                priceSource: Alerts.AlertPriceSource.LAST_PRICE,
                                priceTicks: 150_500_000_000n,
                                status: Alerts.AlertStatus.ACTIVE,
                                channels: [Alerts.AlertChannel.IN_APP],
                                revision: 1n,
                            },
                        },
                    },
                },
            },
            // Formatting needs the catalog, which does not know this market: skipped, not fatal.
            {
                seq: 7n,
                event: {
                    case: "view",
                    value: {
                        kind: {
                            case: "ordersTable",
                            value: { orders: [{ orderId: 1n, symbolId: 99 }], accountId: 42n },
                        },
                    },
                },
            },
            { seq: 8n, event: { case: undefined } },
            {
                seq: 9n,
                event: {
                    case: "runCompleted",
                    value: { usage: { inputTokens: 10n, outputTokens: 5n, cachedInputTokens: 2n } },
                },
            },
        ]);

        const events = await collect(service.watchRun({ runId: formatId(1n), afterSeq: 2 }));

        expect(requests[0]).toMatchObject({ runId: 1n, afterSeq: 2n });
        expect(scales.ready).toHaveBeenCalled();
        expect(events).toEqual([
            { seq: 3, createdAt: 1000, type: "text_delta", text: "Hi" },
            {
                seq: 4,
                createdAt: undefined,
                type: "tool_started",
                toolCallId: "t1",
                name: "get_candles",
                input: { symbol: "SOL" },
            },
            {
                seq: 5,
                createdAt: undefined,
                type: "approval_requested",
                approvalId: formatId(11n),
                summary: "Buy 1 SOL at 150",
                expiresAt: undefined,
                parameters: [{ label: "Price", value: "150 USDT" }],
                accountId: formatId(42n),
                preview: {
                    type: "order",
                    symbolId: 1,
                    symbol: "SOL-USDT",
                    baseAsset: "SOL",
                    quoteAsset: "USDT",
                    side: "buy",
                    quantity: "1",
                    quoteAmount: undefined,
                    estimatedValue: undefined,
                    reservedAmount: undefined,
                    referencePrice: undefined,
                    order: {
                        type: "limit",
                        price: "150",
                        timeInForce: "gtc",
                        expireAt: undefined,
                        postOnly: true,
                        attached: undefined,
                    },
                    relativePrices: [],
                },
            },
            {
                seq: 6,
                createdAt: undefined,
                type: "view",
                view: {
                    type: "price_alert",
                    alert: expect.objectContaining({
                        alertId: formatId(9n),
                        price: "150.5",
                        direction: "above",
                        channels: ["in_app"],
                    }),
                },
            },
            { seq: 7, createdAt: undefined, type: "view", view: { type: "unspecified" } },
            { seq: 8, createdAt: undefined, type: "unspecified" },
            {
                seq: 9,
                createdAt: undefined,
                type: "run_completed",
                usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 2 },
            },
        ]);
    });

    it("maps an error raised mid-stream after the events already received", async () => {
        const { service } = streamingService(
            [{ seq: 1n, event: { case: "textDelta", value: { text: "a" } } }],
            new ConnectError("maintenance", Code.Unavailable),
        );

        const received: AssistantRunEvent[] = [];
        await expect(async () => {
            for await (const event of service.watchRun({ runId: formatId(1n) })) {
                received.push(event);
            }
        }).rejects.toBeInstanceOf(ServiceUnavailableError);
        expect(received.map((e) => e.seq)).toEqual([1]);
    });
});
