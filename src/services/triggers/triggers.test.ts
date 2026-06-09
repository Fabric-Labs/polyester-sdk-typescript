import { afterEach, describe, expect, it, vi } from "vitest";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { realtimeClientStub, unaryTransportByMethod } from "../../testing/service-harness.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { TriggersService } from "./triggers.js";

function seedPairCatalog() {
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
        name: "Tether USD",
        quantityDisplayDecimals: 2,
        quantityScale: 6,
    };

    return createTestCatalog({
        pairs: [
            {
                symbolId: 1,
                symbol: "BTC-USDT",
                baseAsset: btc,
                quoteAsset: usdt,
                tickSize: "0.01",
                stepSize: "0.000001",
                minNotionalQuote: "1",
                minQtyBase: "0.000001",
                allowBuyFeeFromReceived: false,
                defaultMarketSlippagePctBuy: 0.5,
                defaultMarketSlippagePctSell: 0.5,
                maxClientRefDriftPct: 0.1,
                listingAt: null,
                delistingAt: null,
                status: "enabled",
            },
        ],
    });
}

function trigger(overrides: Partial<Proto.Trigger> = {}): Proto.Trigger {
    return {
        triggerId: 11n,
        subaccountId: 22n,
        symbolId: 1,
        symbol: "BTC-USDT",
        triggerType: Proto.TriggerType.STOP_LOSS,
        status: Proto.TriggerStatus.ARMED,
        side: ProtoOrders.Side.SELL,
        orderType: ProtoOrders.OrderType.LIMIT,
        tif: ProtoOrders.TIF.GTC,
        qtyScaled: 50_000_000n,
        limitPriceTicks: 99_500_000n,
        feeSource: ProtoOrders.FeeSource.QUOTE,
        stpMode: ProtoOrders.STPMode.EXPIRE_MAKER,
        postOnly: false,
        clientTriggerId: "trigger-client-1",
        childOrderIds: [],
        details: {
            case: "stop",
            value: {
                triggerPriceTicks: 100_000_000n,
                triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
                triggerDirection: ProtoOrders.TriggerDirection.BELOW,
            },
        },
        ...overrides,
    } as Proto.Trigger;
}

function triggerEvent(overrides: Partial<Proto.TriggerEvent> = {}): Proto.TriggerEvent {
    return {
        triggerId: 11n,
        subaccountId: 22n,
        symbolId: 1,
        triggerType: Proto.TriggerType.STOP_LOSS,
        eventType: Proto.TriggerEventType.FIRED,
        tsNs: 1_700_000_000_123_456_789n,
        childSeq: 1,
        childOrderId: 33n,
        firePxTicks: 100_000_000n,
        reason: "crossed",
        ...overrides,
    } as Proto.TriggerEvent;
}

const createResult = {
    triggerId: 11n,
    status: Proto.TriggerStatus.CREATED,
    tsNs: 1_000_000n,
    clientTriggerId: "trigger-client-1",
};

describe("TriggersService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes all create trigger variants and parses create responses", async () => {
        const catalog = seedPairCatalog();

        const cases: {
            name: string;
            input: Parameters<TriggersService["create"]>[0];
            expected: Record<string, unknown>;
        }[] = [
            {
                name: "stop loss",
                input: {
                    subaccountId: "11",
                    triggerType: "stop_loss",
                    symbol: " BTC-USDT ",
                    side: "sell",
                    orderType: "limit",
                    tif: "gtc",
                    qty: "0.5",
                    limitPrice: "99.50",
                    triggerPrice: "100.00",
                    clientTriggerId: " trigger-client-1 ",
                },
                expected: {
                    subaccountId: 11n,
                    triggerType: Proto.TriggerType.STOP_LOSS,
                    triggerDirection: ProtoOrders.TriggerDirection.BELOW,
                    triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
                    triggerPriceTicks: 100_000_000n,
                    limitPriceTicks: 99_500_000n,
                    qtyScaled: 50_000_000n,
                    clientTriggerId: "trigger-client-1",
                },
            },
            {
                name: "take profit",
                input: {
                    triggerType: "take_profit",
                    symbol: "BTC-USDT",
                    side: "sell",
                    orderType: "market",
                    tif: "ioc",
                    qty: "0.25",
                    triggerPrice: "101.00",
                    clientTriggerId: "trigger-client-2",
                },
                expected: {
                    triggerType: Proto.TriggerType.TAKE_PROFIT,
                    triggerDirection: ProtoOrders.TriggerDirection.ABOVE,
                    triggerPriceTicks: 101_000_000n,
                    limitPriceTicks: 0n,
                    qtyScaled: 25_000_000n,
                },
            },
            {
                name: "trailing stop",
                input: {
                    triggerType: "trailing_stop",
                    symbol: "BTC-USDT",
                    side: "buy",
                    orderType: "market",
                    tif: "ioc",
                    qty: "0.25",
                    trailingDistance: { kind: "percent", percent: "1.5" },
                    activationPrice: "99.00",
                    maxSlippage: { kind: "quote", quote: "0.25" },
                    clientTriggerId: "trigger-client-3",
                },
                expected: {
                    triggerType: Proto.TriggerType.TRAILING_STOP,
                    trailingDistance: { case: "trailingDistanceBps", value: 150 },
                    activationPriceTicks: 99_000_000n,
                    maxSlippage: { case: "maxSlippageTicks", value: 250_000 },
                    triggerDirection: ProtoOrders.TriggerDirection.ABOVE,
                    triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
                },
            },
            {
                name: "twap",
                input: {
                    triggerType: "twap",
                    symbol: "BTC-USDT",
                    side: "buy",
                    orderType: "market",
                    tif: "ioc",
                    qty: "1",
                    twapDurationMs: "60000",
                    twapSliceIntervalMs: 5000,
                    maxSlippage: { kind: "bps", bps: 25 },
                    clientTriggerId: "trigger-client-4",
                },
                expected: {
                    triggerType: Proto.TriggerType.TWAP,
                    twapDurationMs: 60_000n,
                    twapSliceIntervalMs: 5_000n,
                    maxSlippage: { case: "maxSlippageBps", value: 25 },
                },
            },
            {
                name: "ladder",
                input: {
                    triggerType: "ladder",
                    symbol: "BTC-USDT",
                    side: "buy",
                    orderType: "limit",
                    tif: "gtc",
                    qty: "1",
                    limitPrice: "100.00",
                    ladderPriceMin: "99.00",
                    ladderPriceMax: "101.00",
                    ladderLevels: "5",
                    ladderDistribution: "linear",
                    clientTriggerId: "trigger-client-5",
                },
                expected: {
                    triggerType: Proto.TriggerType.LADDER,
                    ladderPriceMinTicks: 99_000_000n,
                    ladderPriceMaxTicks: 101_000_000n,
                    ladderLevels: 5,
                    ladderDistribution: Proto.LadderDistribution.LINEAR,
                },
            },
        ];

        for (const testCase of cases) {
            const transport = unaryTransportByMethod({ createTrigger: createResult });
            const service = new TriggersService(
                transport.transport,
                realtimeClientStub().realtime,
                undefined,
                catalog,
            );

            await expect(service.create(testCase.input)).resolves.toMatchObject({
                status: "created",
                tsNs: 1,
                clientTriggerId: "trigger-client-1",
            });
            const captured = transport.lastCall();
            expect(captured?.method.localName).toBe("createTrigger");
            expect(captured).toMatchObject({
                message: testCase.expected,
            });
        }
    });

    it("normalizes read methods, defaults, resolver state, and call options", async () => {
        const catalog = seedPairCatalog();
        const controller = new AbortController();
        const resolver: SubaccountResolver = {
            getDefaultSubaccountId: () => "11",
        };
        const transport = unaryTransportByMethod({
            getTrigger: {},
            listTriggers: { triggers: [trigger()], total: 1 },
            listTriggerEvents: { events: [triggerEvent()], nextBeforeTsNs: 2_000_000n },
        });
        const service = new TriggersService(
            transport.transport,
            realtimeClientStub().realtime,
            resolver,
            catalog,
        );

        await expect(service.get({ triggerId: "22", subaccountId: "" })).resolves.toBeNull();
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
            total: 1,
            triggers: [
                {
                    clientTriggerId: "trigger-client-1",
                    status: "armed",
                    details: { case: "stop", triggerPrice: "100" },
                },
            ],
        });
        await expect(service.listEvents({ triggerId: "22", limit: 2 })).resolves.toMatchObject({
            nextBeforeTsNs: 2,
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
        ).toEqual({
            triggerId: 22n,
        });
        expect(
            transport.calls.find((call) => call.method.localName === "listTriggers"),
        ).toMatchObject({
            signal: controller.signal,
            message: {
                subaccountId: 11n,
                parentOrderId: 33n,
                symbol: "BTC-USDT",
                status: [Proto.TriggerStatus.ARMED, Proto.TriggerStatus.PAUSED],
                triggerType: Proto.TriggerType.TWAP,
                limit: 50,
                offset: 0,
            },
        });
        expect(
            transport.calls.find((call) => call.method.localName === "listTriggerEvents")?.message,
        ).toEqual({
            triggerId: 22n,
            subaccountId: 11n,
            limit: 2,
            beforeTsNs: 0n,
        });
    });

    it("normalizes trigger mutations and forwards step-up metadata", async () => {
        const catalog = seedPairCatalog();
        const transport = unaryTransportByMethod({
            cancelTrigger: {
                triggerId: 22n,
                status: Proto.TriggerStatus.CANCELLED,
                tsNs: 1_000_000n,
            },
            modifyTrigger: {
                triggerId: 22n,
                status: Proto.TriggerStatus.ARMED,
                tsNs: 2_000_000n,
            },
            pauseTrigger: {
                triggerId: 22n,
                status: Proto.TriggerStatus.PAUSED,
                tsNs: 3_000_000n,
            },
            resumeTrigger: {
                triggerId: 22n,
                status: Proto.TriggerStatus.ARMED,
                tsNs: 4_000_000n,
            },
        });
        const service = new TriggersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            catalog,
        );

        await expect(
            service.cancel({ triggerId: "22", subaccountId: "11" }, { stepUpToken: " fresh " }),
        ).resolves.toMatchObject({ status: "cancelled", tsNs: 1 });
        await expect(
            service.modify({
                triggerId: "22",
                subaccountId: "11",
                triggerPrice: "101.25",
                maxSlippage: { kind: "none" },
            }),
        ).resolves.toMatchObject({ status: "armed", tsNs: 2 });
        await expect(service.pause({ triggerId: "22" })).resolves.toMatchObject({
            status: "paused",
            tsNs: 3,
        });
        await expect(service.resume({ triggerId: "22" })).resolves.toMatchObject({
            status: "armed",
            tsNs: 4,
        });

        expect(new Headers(transport.calls[0]?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "fresh",
        );
        expect(
            transport.calls.find((call) => call.method.localName === "cancelTrigger")?.message,
        ).toEqual({
            triggerId: 22n,
            subaccountId: 11n,
        });
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
        ).toEqual({
            triggerId: 22n,
        });
        expect(
            transport.calls.find((call) => call.method.localName === "resumeTrigger")?.message,
        ).toEqual({
            triggerId: 22n,
        });
    });

    it("uses private trigger channels and parses trigger publications", () => {
        const catalog = seedPairCatalog();
        const realtime = realtimeClientStub();
        const service = new TriggersService(
            unaryTransportByMethod({}).transport,
            realtime.realtime,
            undefined,
            catalog,
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
            }),
        );
        expect(() =>
            realtime.params?.onPublication(
                trigger({ triggerType: Proto.TriggerType.TRIGGER_TYPE_UNSPECIFIED }),
            ),
        ).toThrow();

        unsubscribe();
        expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("uses private trigger event channels and parses event publications", () => {
        const catalog = seedPairCatalog();
        const realtime = realtimeClientStub();
        const service = new TriggersService(
            unaryTransportByMethod({}).transport,
            realtime.realtime,
            undefined,
            catalog,
        );
        const onEvent = vi.fn();

        service.subscribeEvents({
            accountId: "account-1",
            onEvent,
        });

        expect(realtime.params?.channel).toBe("private:spot:triggers:events:account-1:proto");
        expect(realtime.params?.schema).toBe(Proto.TriggerEventSchema);
        realtime.params?.onPublication(triggerEvent());

        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: "fired",
                symbol: "BTC-USDT",
                firePrice: "100",
                reason: "crossed",
            }),
        );
        expect(() =>
            realtime.params?.onPublication(
                triggerEvent({ eventType: Proto.TriggerEventType.TRIGGER_EVENT_TYPE_UNSPECIFIED }),
            ),
        ).toThrow();
    });

    it("rejects invalid create input and malformed backend trigger responses", async () => {
        const catalog = seedPairCatalog();
        const transport = unaryTransportByMethod({
            getTrigger: {
                trigger: trigger({ status: Proto.TriggerStatus.TRIGGER_STATUS_UNSPECIFIED }),
            },
        });
        const service = new TriggersService(
            transport.transport,
            realtimeClientStub().realtime,
            undefined,
            catalog,
        );

        await expect(
            service.create({
                triggerType: "twap",
                symbol: "BTC-USDT",
                side: "buy",
                orderType: "market",
                tif: "ioc",
                qty: "1",
                twapDurationMs: 500,
                twapSliceIntervalMs: 100,
            }),
        ).rejects.toThrow();
        expect(transport.unary).not.toHaveBeenCalled();

        await expect(service.get({ triggerId: "22" })).rejects.toThrow();
    });
});
