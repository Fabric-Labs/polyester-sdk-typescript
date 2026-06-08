import { afterEach, describe, expect, it } from "vitest";
import * as v from "valibot";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { setEnrichedPairCatalog } from "../../catalogs/market-data-catalog.js";
import {
    CancelOrderInputSchema,
    type ModifyOrderInput,
    ModifyOrderInputSchema,
    NewOrderInputSchema,
    OrderHistoryInputSchema,
    OrderSchema,
} from "./orders.schemas.js";

type AssertModifyOrderInput<T extends ModifyOrderInput> = T;

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

function seedPairCatalog(): void {
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

    setEnrichedPairCatalog([
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
    ]);
}

afterEach(() => {
    setEnrichedPairCatalog([]);
});

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
        seedPairCatalog();

        const cases = [
            {
                name: "limit",
                input: {
                    subaccountId: "11",
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
            expect(v.parse(NewOrderInputSchema, testCase.input)).toMatchObject(testCase.expected);
        }
    });

    it("rejects market-only slippage fields on limit orders", () => {
        seedPairCatalog();

        expect(() =>
            v.parse(NewOrderInputSchema, {
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
});

describe("ModifyOrderInputSchema", () => {
    it("requires one order key and at least one patch field", () => {
        seedPairCatalog();

        expect(() =>
            v.parse(ModifyOrderInputSchema, {
                orderId: "11",
                clientOrderId: "client-1",
                symbol: "BTC-USDT",
                newQty: "0.5",
            }),
        ).toThrow();
        expect(() =>
            v.parse(ModifyOrderInputSchema, {
                orderId: "11",
                symbol: "BTC-USDT",
            }),
        ).toThrow();
    });

    it("normalizes client-order patches and clear-risk requests", () => {
        seedPairCatalog();

        const patch = v.parse(ModifyOrderInputSchema, {
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

    it("rejects invalid risk patch states", () => {
        seedPairCatalog();

        expect(() =>
            v.parse(ModifyOrderInputSchema, {
                orderId: "11",
                symbol: "BTC-USDT",
                risk: {},
            }),
        ).toThrow();
        expect(() =>
            v.parse(ModifyOrderInputSchema, {
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
            v.parse(ModifyOrderInputSchema, {
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
        seedPairCatalog();

        const order = v.parse(OrderSchema, rawOrder({ status: ProtoRead.OrderStatus.FILLED }));

        expect(order.status).toBe("filled");
    });

    it("keeps the derived partial status for working orders with fills", () => {
        seedPairCatalog();

        const order = v.parse(OrderSchema, rawOrder({ cumQty: 50_000_000n }));

        expect(order.status).toBe("partial");
    });

    it("rejects unspecified order status values", () => {
        seedPairCatalog();

        expect(() =>
            v.parse(
                OrderSchema,
                rawOrder({ status: ProtoRead.OrderStatus.ORDER_STATUS_UNSPECIFIED }),
            ),
        ).toThrow("invalid status 0");
    });

    it("rejects unspecified backend enum values", () => {
        seedPairCatalog();

        expect(() =>
            v.parse(OrderSchema, rawOrder({ side: ProtoWrite.Side.SIDE_UNSPECIFIED })),
        ).toThrow();
    });
});
