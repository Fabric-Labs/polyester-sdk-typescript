import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import {
    createCreateTriggerInputSchema,
    createTriggerEventSchema,
    createTriggerSchema,
    ListTriggerEventsInputSchema,
    ModifyTriggerInputSchema,
} from "./triggers.schemas.js";

describe("ListTriggerEventsInputSchema", () => {
    it("parses a supplied cursor", () => {
        const input = v.parse(ListTriggerEventsInputSchema, {
            triggerId: "11",
            beforeTsNs: " 100 ",
        });

        expect(input.triggerId).toBe(11n);
        expect(input.beforeTsNs).toBe(100n);
    });

    it("omits an absent cursor", () => {
        const input = v.parse(ListTriggerEventsInputSchema, { triggerId: "11" });

        expect(input.beforeTsNs).toBeUndefined();
    });

    it("rejects an invalid supplied cursor", () => {
        expect(() =>
            v.parse(ListTriggerEventsInputSchema, {
                triggerId: "11",
                beforeTsNs: "bad-cursor",
            }),
        ).toThrow();
    });
});

describe("CreateTriggerInputSchema", () => {
    it("normalizes stop trigger fields and applies child order defaults", () => {
        const schema = createCreateTriggerInputSchema();

        const input = v.parse(schema, {
            triggerType: "stop_loss",
            symbol: " BTC-USDT ",
            side: "sell",
            orderType: "limit",
            tif: "gtc",
            qtyScaled: "50000000",
            limitPriceTicks: "99500000",
            triggerPriceTicks: "100000000",
            clientTriggerId: " trigger-client-1 ",
        });

        expect(input).toMatchObject({
            symbol: "BTC-USDT",
            side: ProtoOrders.Side.SELL,
            orderType: ProtoOrders.OrderType.LIMIT,
            tif: ProtoOrders.TIF.GTC,
            qtyScaled: 50_000_000n,
            limitPriceTicks: 99_500_000n,
            triggerType: Proto.TriggerType.STOP_LOSS,
            triggerPriceTicks: 100_000_000n,
            triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
            triggerDirection: ProtoOrders.TriggerDirection.BELOW,
            feeSource: ProtoOrders.FeeSource.QUOTE,
            stpMode: ProtoOrders.STPMode.EXPIRE_MAKER,
            postOnly: false,
            clientTriggerId: "trigger-client-1",
        });
    });

    it("normalizes explicit child order core fields", () => {
        const schema = createCreateTriggerInputSchema();

        const input = v.parse(schema, {
            triggerType: "stop_loss",
            symbol: "BTC-USDT",
            side: "sell",
            orderType: "limit",
            tif: "gtc",
            qtyScaled: "50000000",
            limitPriceTicks: "99500000",
            triggerPriceTicks: "100000000",
            feeSource: "received",
            stpMode: "expire_both",
            postOnly: true,
            clientTriggerId: "trigger-client-1",
        });

        expect(input).toMatchObject({
            feeSource: ProtoOrders.FeeSource.RECEIVED,
            stpMode: ProtoOrders.STPMode.EXPIRE_BOTH,
            postOnly: true,
            limitPriceTicks: 99_500_000n,
            qtyScaled: 50_000_000n,
        });
    });

    it("normalizes trailing distance and max slippage variants", () => {
        const schema = createCreateTriggerInputSchema();

        const quoteDistanceInput = v.parse(schema, {
            triggerType: "trailing_stop",
            symbol: "BTC-USDT",
            side: "buy",
            orderType: "market",
            tif: "ioc",
            qtyScaled: "25000000",
            trailingDistance: { kind: "quote", quote: "0.50" },
            maxSlippage: { kind: "percent", percent: "1.25" },
            clientTriggerId: "trigger-client-2",
        });
        const percentDistanceInput = v.parse(schema, {
            triggerType: "trailing_stop",
            symbol: "BTC-USDT",
            side: "buy",
            orderType: "market",
            tif: "ioc",
            qtyScaled: "25000000",
            trailingDistance: { kind: "percent", percent: "1.5" },
            maxSlippage: { kind: "quote", quote: "0.25" },
            clientTriggerId: "trigger-client-2",
        });

        expect(quoteDistanceInput).toMatchObject({
            trailingDistance: { case: "trailingDistanceTicks", value: 500_000n },
            maxSlippage: { case: "maxSlippageBps", value: 125 },
            activationPriceTicks: undefined,
            triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
            triggerDirection: ProtoOrders.TriggerDirection.ABOVE,
        });
        expect(percentDistanceInput).toMatchObject({
            trailingDistance: { case: "trailingDistanceBps", value: 150 },
            maxSlippage: { case: "maxSlippageTicks", value: 250_000 },
            activationPriceTicks: undefined,
            triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
            triggerDirection: ProtoOrders.TriggerDirection.ABOVE,
        });
    });

    it("validates raw child order quantity and limit price fields", () => {
        const schema = createCreateTriggerInputSchema();
        const baseTrigger = {
            triggerType: "stop_loss",
            symbol: "BTC-USDT",
            side: "sell",
            orderType: "limit",
            tif: "gtc",
            qtyScaled: "50000000",
            limitPriceTicks: "99500000",
            triggerPriceTicks: "100000000",
        } as const;

        expect(() =>
            v.parse(schema, {
                ...baseTrigger,
                qtyScaled: "0.0000015",
            }),
        ).toThrow("qtyScaled must be a decimal integer");
        expect(() =>
            v.parse(schema, {
                ...baseTrigger,
                qtyScaled: "0",
            }),
        ).toThrow("qtyScaled must be greater than 0");
        expect(() =>
            v.parse(schema, {
                ...baseTrigger,
                limitPriceTicks: "99.501",
            }),
        ).toThrow("limitPriceTicks must be a decimal integer");
    });

    it("rejects invalid timing and ladder bounds", () => {
        const schema = createCreateTriggerInputSchema();

        expect(() =>
            v.parse(schema, {
                triggerType: "twap",
                symbol: "BTC-USDT",
                side: "buy",
                orderType: "market",
                tif: "ioc",
                qtyScaled: "100000000",
                twapDurationMs: 500,
                twapSliceIntervalMs: 100,
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                triggerType: "ladder",
                symbol: "BTC-USDT",
                side: "buy",
                orderType: "limit",
                tif: "gtc",
                qtyScaled: "100000000",
                limitPriceTicks: "100",
                ladderPriceMinTicks: "99",
                ladderPriceMaxTicks: "101",
                ladderLevels: 1,
            }),
        ).toThrow();
    });
});

describe("ModifyTriggerInputSchema", () => {
    it("requires at least one patch field", () => {
        expect(() =>
            v.parse(ModifyTriggerInputSchema, {
                triggerId: "11",
            }),
        ).toThrow();
    });

    it("normalizes patch fields and empty oneofs", () => {
        const input = v.parse(ModifyTriggerInputSchema, {
            triggerId: "11",
            account: { subaccountId: "22" },
            triggerPriceTicks: "101250000",
            maxSlippage: { kind: "none" },
        });

        expect(input).toMatchObject({
            triggerId: 11n,
            subaccountId: 22n,
            triggerPriceTicks: 101_250_000n,
            trailingDistance: { case: undefined, value: undefined },
            maxSlippage: { case: undefined, value: undefined },
        });
    });
});

describe("Trigger and TriggerEvent schemas", () => {
    it("rejects unspecified backend enum values", () => {
        const triggerSchema = createTriggerSchema();
        const triggerEventSchema = createTriggerEventSchema();

        expect(() =>
            v.parse(triggerSchema, {
                triggerId: 11n,
                subaccountId: 22n,
                symbolId: 1,
                symbol: "BTC-USDT",
                triggerType: Proto.TriggerType.TRIGGER_TYPE_UNSPECIFIED,
                status: Proto.TriggerStatus.ARMED,
                side: ProtoOrders.Side.BUY,
                orderType: ProtoOrders.OrderType.LIMIT,
                tif: ProtoOrders.TIF.GTC,
                qtyScaled: 50_000_000n,
                limitPriceTicks: 100_000_000n,
                feeSource: ProtoOrders.FeeSource.QUOTE,
                stpMode: ProtoOrders.STPMode.EXPIRE_MAKER,
                postOnly: false,
                clientTriggerId: "trigger-client-1",
            }),
        ).toThrow();
        expect(() =>
            v.parse(triggerEventSchema, {
                triggerId: 11n,
                subaccountId: 22n,
                symbolId: 1,
                triggerType: Proto.TriggerType.STOP_LOSS,
                eventType: Proto.TriggerEventType.TRIGGER_EVENT_TYPE_UNSPECIFIED,
                tsNs: 1_000_000n,
                childSeq: 1,
                childOrderId: 0n,
                firePxTicks: 0n,
                reason: "",
            }),
        ).toThrow();
    });
});
