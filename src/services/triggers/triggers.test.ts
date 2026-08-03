import { afterEach, describe, expect, it, vi } from "vitest";
import { create } from "@bufbuild/protobuf";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransportByMethod } from "../../testing/service-harness.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { TriggersService } from "./triggers.js";

const btc = {
    symbol: "BTC",
    ledgerId: 1,
    name: "Bitcoin",
    quantityDisplayDecimals: 8,
    quantityScale: 8,
};
const usdt = {
    symbol: "USDT",
    ledgerId: 2,
    name: "Tether",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};

const btcUsdt: EnrichedPairConfig = {
    symbolId: 1,
    symbol: "BTC-USDT",
    baseAsset: btc,
    quoteAsset: usdt,
    tickSize: "0.000001",
    stepSize: "0.00000001",
    minNotionalQuote: "1",
    minQtyBase: "0.00000001",
    allowBuyFeeFromBase: true,
    defaultMarketSlippagePctBuy: 0,
    defaultMarketSlippagePctSell: 0,
    maxClientRefDriftPct: 0,
    listingAt: null,
    delistingAt: null,
    status: "enabled",
};

function testScales() {
    const catalog = createTestCatalog({ pairs: [btcUsdt] });
    return createCatalogSdkScales(() => catalog);
}

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function trigger(overrides: Partial<Proto.Trigger> = {}): Proto.Trigger {
    return {
        triggerId: 11n,
        subaccountId: 22n,
        symbolId: 1,
        symbol: "BTC-USDT",
        status: Proto.TriggerStatus.STATUS_ARMED,
        qtyScaled: 50_000_000n,
        feeAsset: ProtoOrders.FeeAsset.QUOTE,
        selfTradePreventionMode: ProtoOrders.SelfTradePreventionMode.EXPIRE_MAKER,
        configuration: {
            case: "stopLoss",
            value: {
                triggerPriceTicks: 100_000_000n,
                side: ProtoOrders.Side.SELL,
                child: {
                    execution: {
                        case: "limitGtc",
                        value: {
                            priceTicks: 99_500_000n,
                            postOnly: false,
                        },
                    },
                },
            },
        },
        runtimeDetails: {
            case: "stop",
            value: {
                triggerPriceTicks: 100_000_000n,
                triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
                triggerDirection: ProtoOrders.TriggerDirection.BELOW,
            },
        },
        clientTriggerId: "trigger-client-1",
        ...overrides,
    } as Proto.Trigger;
}

function triggerEvent(overrides: Partial<Proto.TriggerEvent> = {}): Proto.TriggerEvent {
    return {
        triggerId: 11n,
        subaccountId: 22n,
        symbolId: 1,
        triggerType: Proto.TriggerType.STOP_LOSS,
        eventType: Proto.TriggerEventType.EVENT_FIRED,
        tsNs: 1_700_000_000_123_456_789n,
        childSeq: 1,
        childOrderId: 33n,
        firePriceTicks: 100_000_000n,
        reason: "crossed",
        ...overrides,
    } as Proto.TriggerEvent;
}

const createResult = {
    triggerId: 11n,
    clientTriggerId: "trigger-client-1",
    acceptedAt: { seconds: 1n, nanos: 250_000_000 },
    acceptedAtTsNs: 1_250_000_000n,
};

describe("TriggersService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("builds nested trigger intents for every admitted execution variant", async () => {
        const cases: {
            name: string;
            input: Parameters<TriggersService["create"]>[0];
            expectedStrategy: Record<string, unknown>;
        }[] = [
            {
                name: "stop-loss market IOC",
                input: {
                    account: { subaccountId: "11" },
                    triggerType: "stop_loss",
                    symbol: " BTC-USDT ",
                    side: "sell",
                    qty: "0.5",
                    triggerPrice: "100",
                    execution: { type: "market_ioc" },
                    clientTriggerId: " trigger-client-1 ",
                },
                expectedStrategy: {
                    case: "stopLoss",
                    value: {
                        triggerPriceTicks: 100_000_000n,
                        side: ProtoOrders.Side.SELL,
                        child: { execution: { case: "marketIoc" } },
                    },
                },
            },
            {
                name: "stop-loss limit GTC",
                input: {
                    triggerType: "stop_loss",
                    symbol: "BTC-USDT",
                    side: "sell",
                    qty: "0.25",
                    triggerPrice: "99",
                    execution: { type: "limit_gtc", price: "98.5", postOnly: true },
                    clientTriggerId: "trigger-client-2",
                },
                expectedStrategy: {
                    case: "stopLoss",
                    value: {
                        triggerPriceTicks: 99_000_000n,
                        side: ProtoOrders.Side.SELL,
                        child: {
                            execution: {
                                case: "limitGtc",
                                value: { priceTicks: 98_500_000n, postOnly: true },
                            },
                        },
                    },
                },
            },
            {
                name: "take-profit limit IOC",
                input: {
                    triggerType: "take_profit",
                    symbol: "BTC-USDT",
                    side: "sell",
                    qty: "0.25",
                    triggerPrice: "101",
                    execution: { type: "limit_ioc", price: "100.5" },
                    clientTriggerId: "trigger-client-3",
                },
                expectedStrategy: {
                    case: "takeProfit",
                    value: {
                        triggerPriceTicks: 101_000_000n,
                        side: ProtoOrders.Side.SELL,
                        child: {
                            execution: {
                                case: "limitIoc",
                                value: { priceTicks: 100_500_000n },
                            },
                        },
                    },
                },
            },
            {
                name: "take-profit limit FOK",
                input: {
                    triggerType: "take_profit",
                    symbol: "BTC-USDT",
                    side: "buy",
                    qty: "0.25",
                    triggerPrice: "101",
                    execution: { type: "limit_fok", price: "101.5" },
                    feeAsset: "base",
                    selfTradePreventionMode: "expire_both",
                    clientTriggerId: "trigger-client-4",
                },
                expectedStrategy: {
                    case: "takeProfit",
                    value: {
                        triggerPriceTicks: 101_000_000n,
                        side: ProtoOrders.Side.BUY,
                        child: {
                            execution: {
                                case: "limitFok",
                                value: { priceTicks: 101_500_000n },
                            },
                        },
                    },
                },
            },
            {
                name: "trailing stop",
                input: {
                    triggerType: "trailing_stop",
                    symbol: "BTC-USDT",
                    qty: "0.25",
                    trailingDistance: { kind: "bps", bps: 150 },
                    activationPrice: "99",
                    maxSlippage: { kind: "slippage", slippage: "0.25" },
                    clientTriggerId: "trigger-client-5",
                },
                expectedStrategy: {
                    case: "trailingStop",
                    value: {
                        side: ProtoOrders.Side.SELL,
                        trailingDistance: { case: "trailingDistanceBps", value: 150 },
                        activationPriceTicks: 99_000_000n,
                        maxSlippage: { case: "maxSlippageTicks", value: 250_000 },
                    },
                },
            },
            {
                name: "TWAP market IOC",
                input: {
                    triggerType: "twap",
                    symbol: "BTC-USDT",
                    side: "buy",
                    qty: "1",
                    durationMs: "60000",
                    sliceIntervalMs: 5000,
                    execution: { type: "market_ioc" },
                    clientTriggerId: "trigger-client-6",
                },
                expectedStrategy: {
                    case: "twap",
                    value: {
                        side: ProtoOrders.Side.BUY,
                        durationMs: 60_000n,
                        sliceIntervalMs: 5_000n,
                        execution: { case: "marketIoc" },
                    },
                },
            },
            {
                name: "TWAP limit GTC",
                input: {
                    triggerType: "twap",
                    symbol: "BTC-USDT",
                    side: "sell",
                    qty: "1",
                    durationMs: 60_000,
                    sliceIntervalMs: 5_000,
                    execution: { type: "limit_gtc", price: "100.25" },
                    clientTriggerId: "trigger-client-7",
                },
                expectedStrategy: {
                    case: "twap",
                    value: {
                        side: ProtoOrders.Side.SELL,
                        durationMs: 60_000n,
                        sliceIntervalMs: 5_000n,
                        execution: {
                            case: "limitGtc",
                            value: { priceTicks: 100_250_000n },
                        },
                    },
                },
            },
            {
                name: "ladder",
                input: {
                    triggerType: "ladder",
                    symbol: "BTC-USDT",
                    side: "buy",
                    qty: "1",
                    priceMin: "99",
                    priceMax: "101",
                    levels: "5",
                    postOnly: true,
                    clientTriggerId: "trigger-client-8",
                },
                expectedStrategy: {
                    case: "ladder",
                    value: {
                        side: ProtoOrders.Side.BUY,
                        priceMinTicks: 99_000_000n,
                        priceMaxTicks: 101_000_000n,
                        levels: 5,
                        postOnly: true,
                    },
                },
            },
        ];

        for (const testCase of cases) {
            const transport = unaryTransportByMethod({ createTrigger: createResult });
            const service = new TriggersService(
                transport.transport,
                realtimeClientStub().realtime,
                undefined,
                testScales(),
            );

            await expect(service.create(testCase.input)).resolves.toMatchObject({
                clientTriggerId: "trigger-client-1",
                acceptedAt: 1_250,
                acceptedAtNs: "1250000000",
            });
            expect(transport.lastCall()).toMatchObject({
                method: { localName: "createTrigger" },
                message: {
                    trigger: {
                        symbol: "BTC-USDT",
                        qtyScaled: expect.any(BigInt),
                        clientTriggerId: expect.stringMatching(/^trigger-client-/),
                        strategy: testCase.expectedStrategy,
                    },
                },
            });
        }

        expect(cases).toHaveLength(8);
    });

    it("normalizes reads and returns configuration separately from runtime state", async () => {
        const controller = new AbortController();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const transport = unaryTransportByMethod({
            getTrigger: {},
            listTriggers: {
                triggers: [trigger(), trigger({ triggerId: 12n, symbolId: 999 })],
                nextPageToken: "next-page",
            },
            listTriggerEvents: { events: [triggerEvent()], nextPageToken: "event-page" },
        });
        const service = new TriggersService(
            transport.transport,
            realtimeClientStub().realtime,
            resolver,
            testScales(),
        );

        await expect(service.get({ triggerId: "22", account: "main" })).resolves.toBeNull();
        await expect(
            service.list(
                {
                    parentOrderId: "33",
                    symbol: " BTC-USDT ",
                    status: ["armed", "paused"],
                    triggerType: "twap",
                },
                { signal: controller.signal },
            ),
        ).resolves.toMatchObject({
            nextPageToken: "next-page",
            triggers: [
                {
                    clientTriggerId: "trigger-client-1",
                    status: "armed",
                    qty: "0.5",
                    configuration: {
                        type: "stop_loss",
                        side: "sell",
                        triggerPrice: "100",
                        execution: {
                            type: "limit_gtc",
                            price: "99.5",
                            postOnly: false,
                        },
                    },
                    runtimeDetails: { case: "stop", triggerPrice: "100" },
                },
            ],
        });
        await expect(
            service.listEvents({ triggerId: "22", limit: 2, eventType: "fired" }),
        ).resolves.toMatchObject({
            nextPageToken: "event-page",
            events: [
                {
                    eventType: "fired",
                    firePrice: "100",
                    reason: "crossed",
                },
            ],
        });

        expect(
            transport.calls.find((call) => call.method.localName === "getTrigger")?.message,
        ).toEqual({ triggerId: 22n });
        expect(
            transport.calls.find((call) => call.method.localName === "listTriggers"),
        ).toMatchObject({
            signal: controller.signal,
            message: {
                subaccountId: 11n,
                parentOrderId: 33n,
                symbol: "BTC-USDT",
                status: [Proto.TriggerStatus.STATUS_ARMED, Proto.TriggerStatus.STATUS_PAUSED],
                triggerType: Proto.TriggerType.TWAP,
                limit: 50,
                pageToken: "",
            },
        });
        expect(
            transport.calls.find((call) => call.method.localName === "listTriggerEvents")?.message,
        ).toEqual({
            triggerId: 22n,
            subaccountId: 11n,
            limit: 2,
            eventType: Proto.TriggerEventType.EVENT_FIRED,
            pageToken: "",
        });
    });

    it("preserves conditional triggers whose response omits child execution", async () => {
        const childlessTrigger = trigger({
            configuration: {
                case: "stopLoss",
                value: create(Proto.ConditionalTriggerSchema, {
                    triggerPriceTicks: 100_000_000n,
                    side: ProtoOrders.Side.SELL,
                }),
            },
        });
        const service = new TriggersService(
            unaryTransportByMethod({
                listTriggers: { triggers: [childlessTrigger], nextPageToken: "" },
            }).transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.list()).resolves.toMatchObject({
            triggers: [
                {
                    triggerId: "C",
                    configuration: {
                        type: "stop_loss",
                        side: "sell",
                        triggerPrice: "100",
                        execution: { type: "unspecified" },
                    },
                },
            ],
        });
    });

    it("lists historical trailing stops without a fixed trigger direction", async () => {
        const trailing = trigger({
            status: Proto.TriggerStatus.STATUS_CANCELED,
            configuration: {
                case: "trailingStop",
                value: create(Proto.TrailingStopTriggerSchema, {
                    side: ProtoOrders.Side.SELL,
                    trailingDistance: { case: "trailingDistanceBps", value: 200 },
                    activationPriceTicks: 0n,
                    maxSlippage: { case: undefined },
                }),
            },
            runtimeDetails: {
                case: "trailing",
                value: create(Proto.TrailingDetailsSchema, {
                    trailingDistanceTicks: 0n,
                    activationPriceTicks: 0n,
                    peakPriceTicks: 100_500_000n,
                    troughPriceTicks: 0n,
                    trailingDistanceBps: 200,
                    maxSlippageTicks: 0,
                    maxSlippageBps: 0,
                    triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
                    triggerDirection: ProtoOrders.TriggerDirection.TRIGGER_DIRECTION_UNSPECIFIED,
                }),
            },
        });
        const transport = unaryTransportByMethod({
            listTriggers: { triggers: [trigger(), trailing], nextPageToken: "" },
        });
        const service = new TriggersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(service.list()).resolves.toMatchObject({
            triggers: [
                {
                    configuration: { type: "stop_loss" },
                    runtimeDetails: { case: "stop", triggerPrice: "100" },
                },
                {
                    status: "cancelled",
                    configuration: {
                        type: "trailing_stop",
                        side: "sell",
                        trailingDistance: { kind: "bps", bps: 200 },
                    },
                    runtimeDetails: {
                        case: "trailing",
                        trailingDistanceBps: 200,
                        triggerDirection: "unspecified",
                    },
                },
            ],
        });
    });

    it("normalizes cancel, modify, pause, and resume mutations", async () => {
        const transport = unaryTransportByMethod({
            cancelTrigger: {
                triggerId: 22n,
                status: Proto.TriggerStatus.STATUS_CANCELED,
                tsNs: 1_000_123n,
            },
            modifyTrigger: {
                triggerId: 22n,
                status: Proto.TriggerStatus.STATUS_ARMED,
                tsNs: 2_000_234n,
            },
            pauseTrigger: {
                triggerId: 22n,
                status: Proto.TriggerStatus.STATUS_PAUSED,
                tsNs: 3_000_345n,
            },
            resumeTrigger: {
                triggerId: 22n,
                status: Proto.TriggerStatus.STATUS_RUNNING,
                tsNs: 4_000_456n,
            },
        });
        const service = new TriggersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(
            service.cancel(
                { triggerId: "22", account: { subaccountId: "11" } },
                { stepUpToken: " fresh " },
            ),
        ).resolves.toMatchObject({ status: "cancelled", ts: 1, tsNs: "1000123" });
        await expect(
            service.modify({
                triggerId: "22",
                account: { subaccountId: "11" },
                triggerPrice: "101.25",
                maxSlippage: { kind: "none" },
            }),
        ).resolves.toMatchObject({ status: "armed", ts: 2, tsNs: "2000234" });
        await expect(
            service.pause({ triggerId: "22", account: { subaccountId: "11" } }),
        ).resolves.toMatchObject({ status: "paused", ts: 3, tsNs: "3000345" });
        await expect(
            service.resume({ triggerId: "22", account: { subaccountId: "11" } }),
        ).resolves.toMatchObject({ status: "running", ts: 4, tsNs: "4000456" });

        expect(new Headers(transport.calls[0]?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "fresh",
        );
        expect(
            transport.calls.find((call) => call.method.localName === "cancelTrigger")?.message,
        ).toEqual({ triggerId: 22n, subaccountId: 11n });
        expect(
            transport.calls.find((call) => call.method.localName === "modifyTrigger")?.message,
        ).toMatchObject({
            triggerId: 22n,
            subaccountId: 11n,
            triggerPriceTicks: 101_250_000n,
            trailingDistance: { case: undefined, value: undefined },
            maxSlippage: { case: undefined, value: undefined },
        });
        expect(
            transport.calls.find((call) => call.method.localName === "pauseTrigger")?.message,
        ).toEqual({ triggerId: 22n, subaccountId: 11n });
        expect(
            transport.calls.find((call) => call.method.localName === "resumeTrigger")?.message,
        ).toEqual({ triggerId: 22n, subaccountId: 11n });
    });

    it("uses private trigger channels and parses trigger publications", async () => {
        const realtime = realtimeClientStub();
        const service = new TriggersService(
            unaryTransportByMethod({}).transport,
            realtime.realtime,
            undefined,
            testScales(),
        );
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();

        const unsubscribe = service.subscribe({
            accountId: "account-1",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("private:spot:triggers:account-1:proto");
        expect(realtime.params?.schema).toBe(Proto.TriggerSchema);
        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        realtime.params?.onError?.({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });
        realtime.params?.onPublication(trigger());
        await flushAsync();

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                clientTriggerId: "trigger-client-1",
                symbol: "BTC-USDT",
                status: "armed",
                qty: "0.5",
                configuration: expect.objectContaining({ type: "stop_loss" }),
                runtimeDetails: expect.objectContaining({ case: "stop" }),
            }),
        );

        realtime.params?.onPublication(trigger({ status: 999 as Proto.TriggerStatus }));
        await flushAsync();

        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: "private:spot:triggers:account-1:proto",
                type: "publication_handler",
            }),
        );
        expect(onEvent).toHaveBeenCalledTimes(1);

        unsubscribe();
        expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("uses private trigger event channels and parses event publications", async () => {
        const realtime = realtimeClientStub();
        const service = new TriggersService(
            unaryTransportByMethod({}).transport,
            realtime.realtime,
            undefined,
            testScales(),
        );
        const onEvent = vi.fn();
        const onError = vi.fn();

        service.subscribeEvents({
            accountId: "account-1",
            onEvent,
            onError,
        });

        expect(realtime.params?.channel).toBe("private:spot:triggers:events:account-1:proto");
        expect(realtime.params?.schema).toBe(Proto.TriggerEventSchema);
        realtime.params?.onPublication(triggerEvent());
        await flushAsync();

        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: "fired",
                symbolId: 1,
                firePrice: "100",
                reason: "crossed",
            }),
        );

        realtime.params?.onPublication(triggerEvent({ eventType: 999 as Proto.TriggerEventType }));
        await flushAsync();

        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: "private:spot:triggers:events:account-1:proto",
                type: "publication_handler",
            }),
        );
        expect(onEvent).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid create input and malformed backend trigger responses", async () => {
        const transport = unaryTransportByMethod({
            getTrigger: {
                trigger: trigger({ status: 999 as Proto.TriggerStatus }),
            },
        });
        const service = new TriggersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            testScales(),
        );

        await expect(
            service.create({
                triggerType: "twap",
                symbol: "BTC-USDT",
                side: "buy",
                qty: "1",
                durationMs: 500,
                sliceIntervalMs: 100,
                execution: { type: "market_ioc" },
            }),
        ).rejects.toThrow();
        expect(transport.unary).not.toHaveBeenCalled();

        await expect(service.get({ triggerId: "22" })).rejects.toThrow();
    });
});
