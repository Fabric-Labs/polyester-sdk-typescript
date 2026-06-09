import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    createCreateTriggerInputSchema,
    createTriggerEventSchema,
    createTriggerSchema,
    ListTriggerEventsInputSchema,
    ModifyTriggerInputSchema,
} from "./triggers.schemas.js";

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
        const schema = createCreateTriggerInputSchema(seedPairCatalog().snapshot());

        const input = v.parse(schema, {
            triggerType: "stop_loss",
            symbol: " BTC-USDT ",
            side: "sell",
            orderType: "limit",
            tif: "gtc",
            qty: "0.5",
            limitPrice: "99.50",
            triggerPrice: "100.00",
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
        const schema = createCreateTriggerInputSchema(seedPairCatalog().snapshot());

        const input = v.parse(schema, {
            triggerType: "stop_loss",
            symbol: "BTC-USDT",
            side: "sell",
            orderType: "limit",
            tif: "gtc",
            qty: "0.5",
            limitPrice: "99.50",
            triggerPrice: "100.00",
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
        const schema = createCreateTriggerInputSchema(seedPairCatalog().snapshot());

        const quoteDistanceInput = v.parse(schema, {
            triggerType: "trailing_stop",
            symbol: "BTC-USDT",
            side: "buy",
            orderType: "market",
            tif: "ioc",
            qty: "0.25",
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
            qty: "0.25",
            trailingDistance: { kind: "percent", percent: "1.5" },
            maxSlippage: { kind: "quote", quote: "0.25" },
            clientTriggerId: "trigger-client-2",
        });

        expect(quoteDistanceInput).toMatchObject({
            trailingDistance: { case: "trailingDistanceTicks", value: 500_000n },
            maxSlippage: { case: "maxSlippageBps", value: 125 },
            activationPriceTicks: 0n,
            triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
            triggerDirection: ProtoOrders.TriggerDirection.ABOVE,
        });
        expect(percentDistanceInput).toMatchObject({
            trailingDistance: { case: "trailingDistanceBps", value: 150 },
            maxSlippage: { case: "maxSlippageTicks", value: 250_000 },
            activationPriceTicks: 0n,
            triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
            triggerDirection: ProtoOrders.TriggerDirection.ABOVE,
        });
    });

    it("validates child order quantity and limit price against pair constraints", () => {
        const schema = createCreateTriggerInputSchema(seedPairCatalog().snapshot());
        const baseTrigger = {
            triggerType: "stop_loss",
            symbol: "BTC-USDT",
            side: "sell",
            orderType: "limit",
            tif: "gtc",
            qty: "0.5",
            limitPrice: "99.50",
            triggerPrice: "100.00",
        } as const;

        expect(() =>
            v.parse(schema, {
                ...baseTrigger,
                qty: "0.0000015",
            }),
        ).toThrow("quantity does not satisfy pair step size");
        expect(() =>
            v.parse(schema, {
                ...baseTrigger,
                qty: "0",
            }),
        ).toThrow("quantity is below pair minimum");
        expect(() =>
            v.parse(schema, {
                ...baseTrigger,
                limitPrice: "99.501",
            }),
        ).toThrow("price does not satisfy pair tick size");
    });

    it("rejects invalid timing and ladder bounds", () => {
        const schema = createCreateTriggerInputSchema(seedPairCatalog().snapshot());

        expect(() =>
            v.parse(schema, {
                triggerType: "twap",
                symbol: "BTC-USDT",
                side: "buy",
                orderType: "market",
                tif: "ioc",
                qty: "1",
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
                qty: "1",
                limitPrice: "100",
                ladderPriceMin: "99",
                ladderPriceMax: "101",
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
            subaccountId: "22",
            triggerPrice: "101.25",
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
        const catalog = seedPairCatalog();
        const triggerSchema = createTriggerSchema(catalog.snapshot());
        const triggerEventSchema = createTriggerEventSchema(catalog.snapshot());

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
