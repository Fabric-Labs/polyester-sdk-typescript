import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    CancelOrderInputSchema,
    createModifyOrderInputSchema,
    createNewOrderInputSchema,
    createOrderSchema,
    type ModifyOrderInput,
    type NewOrderInput,
    OrderHistoryInputSchema,
} from "./orders.schemas.js";

type AssertNewOrderInput<T extends NewOrderInput> = T;
type AssertModifyOrderInput<T extends ModifyOrderInput> = T;

type _ValidNewOrderWithAttachedRisk = AssertNewOrderInput<{
    symbol: string;
    side: "buy";
    orderType: "limit";
    tif: "gtc";
    price: string;
    qty: string;
    risk: {
        takeProfit: {
            triggerPrice: string;
        };
        trailingStop: {
            trailingDistance: {
                kind: "ticks";
                ticks: string;
            };
        };
    };
}>;

// @ts-expect-error new order risk policies must include at least one leg
type _InvalidNewOrderWithEmptyRisk = AssertNewOrderInput<{
    symbol: string;
    side: "buy";
    orderType: "limit";
    tif: "gtc";
    price: string;
    qty: string;
    risk: {};
}>;

// @ts-expect-error stopLoss and trailingStop are mutually exclusive stop legs
type _InvalidNewOrderWithBothStopLegs = AssertNewOrderInput<{
    symbol: string;
    side: "buy";
    orderType: "limit";
    tif: "gtc";
    price: string;
    qty: string;
    risk: {
        stopLoss: {
            triggerPrice: string;
        };
        trailingStop: {
            trailingDistance: {
                kind: "ticks";
                ticks: string;
            };
        };
    };
}>;

type _ValidModifyByOrderIdWithPrice = AssertModifyOrderInput<{
    orderId: string;
    symbol: string;
    newPrice: string;
}>;

type _ValidModifyByClientOrderIdWithRisk = AssertModifyOrderInput<{
    clientOrderId: string;
    symbol: string;
    risk: {
        takeProfit: {
            triggerPrice: string;
        };
    };
}>;

type _ValidModifyWithClearRisk = AssertModifyOrderInput<{
    clientOrderId: string;
    symbol: string;
    clearRisk: true;
}>;

// @ts-expect-error modify requires exactly one order key
type _InvalidModifyWithoutOrderKey = AssertModifyOrderInput<{
    symbol: string;
    newQty: string;
}>;

// @ts-expect-error modify accepts orderId or clientOrderId, not both
type _InvalidModifyWithBothOrderKeys = AssertModifyOrderInput<{
    orderId: string;
    clientOrderId: string;
    symbol: string;
    newQty: string;
}>;

// @ts-expect-error modify requires at least one patch field
type _InvalidModifyWithoutPatch = AssertModifyOrderInput<{
    orderId: string;
    symbol: string;
}>;

// @ts-expect-error risk and clearRisk are mutually exclusive
type _InvalidModifyWithRiskAndClearRisk = AssertModifyOrderInput<{
    orderId: string;
    symbol: string;
    risk: {
        takeProfit: {
            triggerPrice: string;
        };
    };
    clearRisk: true;
}>;

// @ts-expect-error risk patches must include at least one leg
type _InvalidModifyWithEmptyRisk = AssertModifyOrderInput<{
    orderId: string;
    symbol: string;
    risk: {};
}>;

// @ts-expect-error stopLoss and trailingStop are mutually exclusive stop legs
type _InvalidModifyWithBothStopLegs = AssertModifyOrderInput<{
    orderId: string;
    symbol: string;
    risk: {
        stopLoss: {
            triggerPrice: string;
        };
        trailingStop: {
            trailingDistance: {
                kind: "ticks";
                ticks: string;
            };
        };
    };
}>;

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

describe("OrderHistoryInputSchema", () => {
    it("parses supplied timestamp filters", () => {
        const input = v.parse(OrderHistoryInputSchema, {
            startTsNs: " 100 ",
            endTsNs: "200",
        });

        expect(input.startTsNs).toBe(100n);
        expect(input.endTsNs).toBe(200n);
    });

    it("omits absent timestamp filters", () => {
        const input = v.parse(OrderHistoryInputSchema, {});

        expect(input.startTsNs).toBeUndefined();
        expect(input.endTsNs).toBeUndefined();
    });

    it("rejects invalid supplied timestamp filters", () => {
        expect(() => v.parse(OrderHistoryInputSchema, { startTsNs: "not-a-ts" })).toThrow();
        expect(() => v.parse(OrderHistoryInputSchema, { endTsNs: "12.3" })).toThrow();
    });
});

describe("NewOrderInputSchema", () => {
    it("normalizes limit and market order fields", () => {
        const schema = createNewOrderInputSchema(seedPairCatalog().snapshot());

        const cases = [
            {
                name: "limit",
                input: {
                    account: { subaccountId: "11" },
                    symbol: " BTC-USDT ",
                    side: "buy",
                    orderType: "limit",
                    tif: "gtc",
                    price: "100.25",
                    qty: "0.5",
                    clientOrderId: " client-1 ",
                    feeSource: "received",
                },
                expected: {
                    subaccountId: 11n,
                    symbol: "BTC-USDT",
                    side: ProtoWrite.Side.BUY,
                    orderType: ProtoWrite.OrderType.LIMIT,
                    tif: ProtoWrite.TIF.GTC,
                    priceTicks: 100_250_000n,
                    qtyScaled: 50_000_000n,
                    clientOrderId: "client-1",
                    feeSource: ProtoWrite.FeeSource.RECEIVED,
                    postOnly: false,
                },
            },
            {
                name: "market",
                input: {
                    symbol: "BTC-USDT",
                    side: "sell",
                    orderType: "market",
                    tif: "ioc",
                    qty: "0.25",
                    marketMaxSlippage: { kind: "percent", percent: "1.5" },
                    marketClientRefPrice: "99.50",
                },
                expected: {
                    side: ProtoWrite.Side.SELL,
                    orderType: ProtoWrite.OrderType.MARKET,
                    tif: ProtoWrite.TIF.IOC,
                    priceTicks: 0n,
                    qtyScaled: 25_000_000n,
                    marketMaxSlippage: { case: "marketMaxSlippageBps", value: 150 },
                    marketClientRefPriceTicks: 99_500_000n,
                },
            },
        ];

        for (const testCase of cases) {
            expect(v.parse(schema, testCase.input)).toMatchObject(testCase.expected);
        }

        const defaultedInput = v.parse(schema, {
            symbol: "BTC-USDT",
            side: "buy",
            orderType: "limit",
            tif: "gtc",
            price: "100",
            qty: "0.5",
        });

        expect(defaultedInput.feeSource).toBe(ProtoWrite.FeeSource.QUOTE);
        expect(defaultedInput.stpMode).toBeUndefined();
    });

    it("rejects market-only slippage fields on limit orders", () => {
        const schema = createNewOrderInputSchema(seedPairCatalog().snapshot());

        expect(() =>
            v.parse(schema, {
                symbol: "BTC-USDT",
                side: "buy",
                orderType: "limit",
                tif: "gtc",
                price: "100",
                qty: "0.5",
                marketMaxSlippage: { kind: "bps", bps: 10 },
            }),
        ).toThrow();
    });

    it("normalizes attached trailing risk with order-only distance and slippage variants", () => {
        const schema = createNewOrderInputSchema(seedPairCatalog().snapshot());

        const input = v.parse(schema, {
            symbol: "BTC-USDT",
            side: "buy",
            orderType: "limit",
            tif: "gtc",
            price: "100",
            qty: "0.5",
            risk: {
                trailingStop: {
                    trailingDistance: { kind: "ticks", ticks: "10" },
                    maxSlippage: { kind: "bps", bps: 25 },
                },
            },
        });

        expect(input.attachedRisk).toMatchObject({
            stopLeg: {
                case: "trailingStop",
                value: {
                    trailingDistance: { case: "trailingDistanceTicks", value: 10n },
                    maxSlippage: { case: "maxSlippageBps", value: 25 },
                },
            },
        });
    });

    it("rejects trigger-only attached trailing risk variants", () => {
        const schema = createNewOrderInputSchema(seedPairCatalog().snapshot());
        const baseOrder = {
            symbol: "BTC-USDT",
            side: "buy",
            orderType: "limit",
            tif: "gtc",
            price: "100",
            qty: "0.5",
        };

        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                risk: {
                    trailingStop: {
                        trailingDistance: { kind: "quote", quote: "0.50" },
                    },
                },
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                risk: {
                    trailingStop: {
                        trailingDistance: { kind: "percent", percent: "1.5" },
                    },
                },
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                risk: {
                    trailingStop: {
                        trailingDistance: { kind: "ticks", ticks: "10" },
                        maxSlippage: { kind: "quote", quote: "0.25" },
                    },
                },
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                risk: {
                    trailingStop: {
                        trailingDistance: { kind: "ticks", ticks: "10" },
                        maxSlippage: { kind: "percent", percent: "1.25" },
                    },
                },
            }),
        ).toThrow();
    });

    it("validates quantity and limit price against pair constraints", () => {
        const schema = createNewOrderInputSchema(seedPairCatalog().snapshot());
        const baseOrder = {
            symbol: "BTC-USDT",
            side: "buy",
            orderType: "limit",
            tif: "gtc",
            price: "100",
            qty: "0.5",
        } satisfies NewOrderInput;

        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                qty: "0.0000015",
            }),
        ).toThrow("quantity does not satisfy pair step size");
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                qty: "0",
            }),
        ).toThrow("quantity is below pair minimum");
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                price: "100.001",
            }),
        ).toThrow("price does not satisfy pair tick size");
    });

    it("rejects invalid attached risk states", () => {
        const schema = createNewOrderInputSchema(seedPairCatalog().snapshot());

        const baseOrder = {
            symbol: "BTC-USDT",
            side: "buy",
            orderType: "limit",
            tif: "gtc",
            price: "100",
            qty: "0.5",
        };

        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                risk: {},
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                risk: {
                    stopLoss: {
                        triggerPrice: "95",
                    },
                    trailingStop: {
                        trailingDistance: {
                            kind: "ticks",
                            ticks: "10",
                        },
                    },
                },
            }),
        ).toThrow();
    });
});

describe("ModifyOrderInputSchema", () => {
    it("requires one order key and at least one patch field", () => {
        const schema = createModifyOrderInputSchema(seedPairCatalog().snapshot());

        expect(() =>
            v.parse(schema, {
                orderId: "11",
                clientOrderId: "client-1",
                symbol: "BTC-USDT",
                newQty: "0.5",
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                orderId: "11",
                symbol: "BTC-USDT",
            }),
        ).toThrow();
    });

    it("normalizes client-order patches and clear-risk requests", () => {
        const schema = createModifyOrderInputSchema(seedPairCatalog().snapshot());

        const patch = v.parse(schema, {
            clientOrderId: " client-1 ",
            symbol: "BTC-USDT",
            newPrice: "101.25",
            clearRisk: true,
        });

        expect(patch).toMatchObject({
            key: { case: "clientOrderId", value: "client-1" },
            newPriceTicks: 101_250_000n,
            newAttachedRisk: {},
            behavior: ProtoWrite.ModifyBehavior.AMEND_OR_REPLACE,
        });
    });

    it("validates new quantity against pair constraints when present", () => {
        const schema = createModifyOrderInputSchema(seedPairCatalog().snapshot());

        expect(() =>
            v.parse(schema, {
                orderId: "11",
                symbol: "BTC-USDT",
                newQty: "0.0000015",
            }),
        ).toThrow("quantity does not satisfy pair step size");
        expect(() =>
            v.parse(schema, {
                orderId: "11",
                symbol: "BTC-USDT",
                newQty: "0",
            }),
        ).toThrow("quantity is below pair minimum");
        expect(() =>
            v.parse(schema, {
                orderId: "11",
                symbol: "BTC-USDT",
                newQty: "0.5",
                newPrice: "100.001",
            }),
        ).toThrow("price does not satisfy pair tick size");
    });

    it("rejects invalid risk patch states", () => {
        const schema = createModifyOrderInputSchema(seedPairCatalog().snapshot());

        expect(() =>
            v.parse(schema, {
                orderId: "11",
                symbol: "BTC-USDT",
                risk: {},
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                orderId: "11",
                symbol: "BTC-USDT",
                risk: {
                    takeProfit: {
                        triggerPrice: "105",
                    },
                },
                clearRisk: true,
                abc: 123,
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                orderId: "11",
                symbol: "BTC-USDT",
                risk: {
                    stopLoss: {
                        triggerPrice: "95",
                    },
                    trailingStop: {
                        trailingDistance: {
                            kind: "ticks",
                            ticks: "10",
                        },
                    },
                },
            }),
        ).toThrow();
    });
});

describe("CancelOrderInputSchema", () => {
    it("normalizes order id and client order id keys", () => {
        expect(v.parse(CancelOrderInputSchema, { orderId: "11" })).toMatchObject({
            key: { case: "orderId", value: 11n },
        });
        expect(v.parse(CancelOrderInputSchema, { clientOrderId: " client-1 " })).toMatchObject({
            key: { case: "clientOrderId", value: "client-1" },
        });
    });

    it("requires exactly one cancel key", () => {
        expect(() => v.parse(CancelOrderInputSchema, {})).toThrow();
        expect(() =>
            v.parse(CancelOrderInputSchema, {
                orderId: "11",
                clientOrderId: "client-1",
            }),
        ).toThrow();
    });
});

describe("OrderSchema", () => {
    function rawOrder(overrides: Record<string, unknown> = {}) {
        return {
            orderId: 11n,
            symbolId: 1,
            clientOrderId: "client-1",
            side: ProtoWrite.Side.BUY,
            status: ProtoRead.OrderStatus.WORKING,
            orderType: ProtoWrite.OrderType.LIMIT,
            tif: ProtoWrite.TIF.GTC,
            stpMode: ProtoWrite.STPMode.EXPIRE_MAKER,
            feeSource: ProtoWrite.FeeSource.QUOTE,
            postOnly: false,
            origQty: 100_000_000n,
            cumQty: 0n,
            leavesQty: 100_000_000n,
            avgPxTicks: 0n,
            priceTicks: 100_000_000n,
            createdTsNs: 1_000_000n,
            terminalTsNs: 0n,
            terminalReasonCode: 0,
            marketClientRefPriceTicks: 0n,
            marketMaxSlippageTicks: 0,
            marketMaxSlippageBps: 0,
            ...overrides,
        };
    }

    it("decodes order status through the codec", () => {
        const schema = createOrderSchema(seedPairCatalog().snapshot());

        const order = v.parse(schema, rawOrder({ status: ProtoRead.OrderStatus.FILLED }));

        expect(order.status).toBe("filled");
    });

    it("keeps the derived partial status for working orders with fills", () => {
        const schema = createOrderSchema(seedPairCatalog().snapshot());

        const order = v.parse(schema, rawOrder({ cumQty: 50_000_000n }));

        expect(order.status).toBe("partial");
    });

    it("decodes attached risk enum fields through the codecs", () => {
        const schema = createOrderSchema(seedPairCatalog().snapshot());

        const order = v.parse(
            schema,
            rawOrder({
                attachedRisk: {
                    takeProfit: {
                        policy: {
                            triggerPriceTicks: 101_000_000n,
                            triggerPriceSource: ProtoWrite.TriggerPriceSource.INDEX_PRICE,
                            orderType: ProtoWrite.OrderType.LIMIT,
                            limitPriceTicks: 102_500_000n,
                        },
                    },
                    oco: false,
                },
            }),
        );

        expect(order.attachedRisk?.takeProfit).toMatchObject({
            triggerPrice: "101",
            triggerPriceSource: "index",
            orderType: "limit",
            limitPrice: "102.5",
        });
    });

    it("rejects unspecified order status values", () => {
        const schema = createOrderSchema(seedPairCatalog().snapshot());

        expect(() =>
            v.parse(schema, rawOrder({ status: ProtoRead.OrderStatus.ORDER_STATUS_UNSPECIFIED })),
        ).toThrow("invalid status 0");
    });

    it("rejects unspecified backend enum values", () => {
        const schema = createOrderSchema(seedPairCatalog().snapshot());

        expect(() =>
            v.parse(schema, rawOrder({ side: ProtoWrite.Side.SIDE_UNSPECIFIED })),
        ).toThrow();
    });
});
