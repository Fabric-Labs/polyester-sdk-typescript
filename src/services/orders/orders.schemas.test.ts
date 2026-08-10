import { describe, expect, expectTypeOf, it } from "vitest";
import * as v from "valibot";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { AccountCode, TransferCode } from "../../gen/ledger/v1/catalog_pb.js";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { formatId } from "../../utils/base58-id.js";
import {
    CancelAllOrdersInputSchema,
    CancelOrderInputSchema,
    createCreateOrderResultSchema,
    createModifyOrderInputSchema,
    createNewOrderInputSchema,
    createOrderSchema,
    createOrderTransferSchema,
    createPreviewOrderResultSchema,
    type ModifyOrderInput,
    type NewOrderInput,
    OrderHistoryInputSchema,
} from "./orders.schemas.js";

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

type AssertNewOrderInput<T extends NewOrderInput> = T;
type AssertModifyOrderInput<T extends ModifyOrderInput> = T;

type _ValidNewOrderWithAttachedRisk = AssertNewOrderInput<{
    symbol: string;
    side: "buy";
    qty: string;
    execution: {
        type: "limit_gtc";
        price: string;
    };
    risk: {
        takeProfit: {
            triggerPrice: string;
            execution: {
                type: "market_ioc";
            };
        };
        trailingStop: {
            trailingDistance: {
                kind: "distance";
                distance: string;
            };
        };
    };
}>;

// @ts-expect-error new order risk policies must include at least one leg
type _InvalidNewOrderWithEmptyRisk = AssertNewOrderInput<{
    symbol: string;
    side: "buy";
    qty: string;
    execution: {
        type: "limit_gtc";
        price: string;
    };
    risk: {};
}>;

// @ts-expect-error stopLoss and trailingStop are mutually exclusive stop legs
type _InvalidNewOrderWithBothStopLegs = AssertNewOrderInput<{
    symbol: string;
    side: "buy";
    qty: string;
    execution: {
        type: "limit_gtc";
        price: string;
    };
    risk: {
        stopLoss: {
            triggerPrice: string;
            execution: {
                type: "market_ioc";
            };
        };
        trailingStop: {
            trailingDistance: {
                kind: "distance";
                distance: string;
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
            execution: {
                type: "market_ioc";
            };
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
                kind: "distance";
                distance: string;
            };
        };
    };
}>;

describe("OrderHistoryInputSchema", () => {
    it("parses supplied trigger and timestamp filters", () => {
        const input = v.parse(OrderHistoryInputSchema, {
            triggerId: formatId(22n),
            startTsNs: " 100 ",
            endTsNs: "200",
        });

        expect(input.triggerId).toBe(22n);
        expect(input.startTsNs).toBe(100n);
        expect(input.endTsNs).toBe(200n);
    });

    it("omits absent trigger and timestamp filters", () => {
        const input = v.parse(OrderHistoryInputSchema, {});

        expect(input.triggerId).toBeUndefined();
        expect(input.startTsNs).toBeUndefined();
        expect(input.endTsNs).toBeUndefined();
    });

    it("rejects invalid supplied trigger and timestamp filters", () => {
        expect(() => v.parse(OrderHistoryInputSchema, { triggerId: "invalid-0" })).toThrow();
        expect(() => v.parse(OrderHistoryInputSchema, { startTsNs: "not-a-ts" })).toThrow();
        expect(() => v.parse(OrderHistoryInputSchema, { endTsNs: "12.3" })).toThrow();
    });
});

describe("CancelAllOrdersInputSchema", () => {
    it("rejects the removed maxOrders cap", () => {
        expect(() =>
            v.parse(CancelAllOrdersInputSchema, {
                dryRun: true,
                maxOrders: 10,
                requestId: "cancel-all-1",
            }),
        ).toThrow();
    });
});

describe("NewOrderInputSchema", () => {
    it("converts decimal limit and market order fields to wire scaled integers", () => {
        const schema = createNewOrderInputSchema(testScales());

        const cases = [
            {
                name: "limit",
                input: {
                    account: { subaccountId: "11" },
                    symbol: " BTC-USDT ",
                    side: "buy",
                    qty: "0.5",
                    execution: {
                        type: "limit_gtc",
                        price: "100.25",
                    },
                    clientOrderId: " client-1 ",
                    feeAsset: "base",
                },
                expected: {
                    subaccountId: 11n,
                    order: {
                        symbol: "BTC-USDT",
                        side: ProtoWrite.Side.BUY,
                        sizing: {
                            case: "baseQtyScaled",
                            value: 50_000_000n,
                        },
                        execution: {
                            case: "limitGtc",
                            value: {
                                priceTicks: 100_250_000n,
                                postOnly: false,
                            },
                        },
                        clientOrderId: "client-1",
                        feeAsset: ProtoWrite.FeeAsset.BASE,
                    },
                },
            },
            {
                name: "market",
                input: {
                    symbol: "BTC-USDT",
                    side: "sell",
                    qty: "0.25",
                    execution: {
                        type: "market_ioc",
                        maxSlippage: { kind: "bps", bps: 150 },
                        clientRefPrice: "99.5",
                    },
                },
                expected: {
                    order: {
                        side: ProtoWrite.Side.SELL,
                        sizing: {
                            case: "baseQtyScaled",
                            value: 25_000_000n,
                        },
                        execution: {
                            case: "marketIoc",
                            value: {
                                maxSlippage: {
                                    case: "maxSlippageBps",
                                    value: 150,
                                },
                                clientRefPriceTicks: 99_500_000n,
                            },
                        },
                    },
                },
            },
        ];

        for (const testCase of cases) {
            expect(v.parse(schema, testCase.input)).toMatchObject(testCase.expected);
        }

        const defaultedInput = v.parse(schema, {
            symbol: "BTC-USDT",
            side: "buy",
            qty: "0.5",
            execution: {
                type: "limit_gtc",
                price: "100",
            },
        });

        expect(defaultedInput.order.feeAsset).toBe(ProtoWrite.FeeAsset.QUOTE);
        expect(defaultedInput.order.selfTradePreventionMode).toBeUndefined();
    });

    it.each([
        ["market_ioc", { type: "market_ioc" }],
        ["limit_ioc", { type: "limit_ioc", price: "100.25" }],
    ] as const)("encodes BUY %s max-quote sizing", (_name, execution) => {
        const output = v.parse(createNewOrderInputSchema(testScales()), {
            symbol: "BTC-USDT",
            side: "buy",
            maxQuoteDebit: "125.5",
            execution,
        });

        expect(output.order.sizing).toEqual({
            case: "maxQuoteDebitScaled",
            value: 125_500_000n,
        });
    });

    it("requires exactly one sizing mode and restricts max-quote sizing to BUY IOC orders", () => {
        const schema = createNewOrderInputSchema(testScales());
        const eligibleOrder = {
            symbol: "BTC-USDT",
            side: "buy",
            execution: { type: "market_ioc" },
        };

        expect(() => v.parse(schema, eligibleOrder)).toThrow();
        expect(() =>
            v.parse(schema, { ...eligibleOrder, qty: "0.5", maxQuoteDebit: "125" }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                ...eligibleOrder,
                side: "sell",
                maxQuoteDebit: "125",
            }),
        ).toThrow("maxQuoteDebit is supported only for BUY market IOC and BUY limit IOC orders");
        expect(() =>
            v.parse(schema, {
                ...eligibleOrder,
                execution: { type: "limit_gtc", price: "100" },
                maxQuoteDebit: "125",
            }),
        ).toThrow("maxQuoteDebit is supported only for BUY market IOC and BUY limit IOC orders");
        expect(() => v.parse(schema, { ...eligibleOrder, maxQuoteDebit: "0" })).toThrow(
            "maxQuoteDebit must be greater than 0",
        );
        expect(() => v.parse(schema, { ...eligibleOrder, maxQuoteDebit: "1.0000001" })).toThrow(
            "maxQuoteDebit supports at most 6 decimal places",
        );
    });

    it("allows base fees only on BUY orders", () => {
        const schema = createNewOrderInputSchema(testScales());

        expect(
            v.parse(schema, {
                symbol: "BTC-USDT",
                side: "buy",
                qty: "0.5",
                execution: { type: "market_ioc" },
                feeAsset: "base",
            }).order.feeAsset,
        ).toBe(ProtoWrite.FeeAsset.BASE);
        expect(() =>
            v.parse(schema, {
                symbol: "BTC-USDT",
                side: "sell",
                qty: "0.5",
                execution: { type: "market_ioc" },
                feeAsset: "base",
            }),
        ).toThrow("SELL orders must use the quote fee asset");
    });

    it("rejects execution fields that do not belong to the selected variant", () => {
        const schema = createNewOrderInputSchema(testScales());

        expect(() =>
            v.parse(schema, {
                symbol: "BTC-USDT",
                side: "buy",
                qty: "0.5",
                execution: {
                    type: "limit_gtc",
                    price: "100",
                    maxSlippage: { kind: "bps", bps: 10 },
                },
            }),
        ).toThrow();
    });

    it.each([
        ["limit_ioc", "limitIoc"],
        ["limit_fok", "limitFok"],
    ] as const)("encodes %s as the matching protobuf execution", (type, expectedCase) => {
        const output = v.parse(createNewOrderInputSchema(testScales()), {
            symbol: "BTC-USDT",
            side: "buy",
            qty: "0.5",
            execution: { type, price: "100.25" },
        });

        expect(output.order.execution).toMatchObject({
            case: expectedCase,
            value: { priceTicks: 100_250_000n },
        });
    });

    it("converts decimal attached risk legs to wire scaled integers", () => {
        const schema = createNewOrderInputSchema(testScales());

        const input = v.parse(schema, {
            symbol: "BTC-USDT",
            side: "buy",
            qty: "0.5",
            execution: { type: "limit_gtc", price: "100" },
            risk: {
                takeProfit: {
                    triggerPrice: "101.5",
                    execution: { type: "limit_gtc", price: "102.25" },
                },
                stopLoss: {
                    triggerPrice: "95",
                    execution: { type: "market_ioc" },
                },
                oco: true,
            },
        });

        expect(input.order.attachedRisk).toMatchObject({
            takeProfit: {
                triggerPriceTicks: 101_500_000n,
                child: {
                    execution: {
                        case: "limitGtc",
                        value: { priceTicks: 102_250_000n },
                    },
                },
            },
            stopLeg: {
                case: "stopLoss",
                value: {
                    triggerPriceTicks: 95_000_000n,
                    child: {
                        execution: {
                            case: "marketIoc",
                            value: {},
                        },
                    },
                },
            },
            oco: true,
        });
    });

    it("normalizes attached trailing risk with decimal distance and slippage variants", () => {
        const schema = createNewOrderInputSchema(testScales());

        const input = v.parse(schema, {
            symbol: "BTC-USDT",
            side: "buy",
            qty: "0.5",
            execution: { type: "limit_gtc", price: "100" },
            risk: {
                trailingStop: {
                    trailingDistance: { kind: "distance", distance: "0.5" },
                    maxSlippage: { kind: "bps", bps: 25 },
                    activationPrice: "99",
                },
            },
        });

        expect(input.order.attachedRisk).toMatchObject({
            stopLeg: {
                case: "trailingStop",
                value: {
                    trailingDistance: { case: "trailingDistanceTicks", value: 500_000n },
                    maxSlippage: { case: "maxSlippageBps", value: 25 },
                    activationPriceTicks: 99_000_000n,
                },
            },
        });

        const slippageInput = v.parse(schema, {
            symbol: "BTC-USDT",
            side: "buy",
            qty: "0.5",
            execution: { type: "limit_gtc", price: "100" },
            risk: {
                trailingStop: {
                    trailingDistance: { kind: "distance", distance: "0.5" },
                    maxSlippage: { kind: "slippage", slippage: "0.25" },
                },
            },
        });

        expect(slippageInput.order.attachedRisk).toMatchObject({
            stopLeg: {
                case: "trailingStop",
                value: {
                    maxSlippage: { case: "maxSlippageTicks", value: 250_000 },
                },
            },
        });
    });

    it("rejects unknown attached trailing risk variants and excess precision", () => {
        const schema = createNewOrderInputSchema(testScales());
        const baseOrder = {
            symbol: "BTC-USDT",
            side: "buy",
            qty: "0.5",
            execution: { type: "limit_gtc", price: "100" },
        };

        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                risk: {
                    trailingStop: {
                        trailingDistance: { kind: "ticks", ticks: "10" },
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
                        trailingDistance: { kind: "distance", distance: "0.5" },
                        maxSlippage: { kind: "ticks", ticks: 10 },
                    },
                },
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                risk: {
                    trailingStop: {
                        trailingDistance: { kind: "distance", distance: "0.0000001" },
                    },
                },
            }),
        ).toThrow("trailingStop.trailingDistance.distance supports at most 6 decimal places");
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                risk: {
                    trailingStop: {
                        trailingDistance: { kind: "distance", distance: "0.5" },
                        maxSlippage: { kind: "slippage", slippage: "10000" },
                    },
                },
            }),
        ).toThrow("trailingStop.maxSlippage.slippage exceeds the maximum supported price distance");
    });

    it("converts decimal market max slippage and rejects oversized values", () => {
        const schema = createNewOrderInputSchema(testScales());
        const baseOrder = {
            symbol: "BTC-USDT",
            side: "sell",
            qty: "0.25",
            execution: { type: "market_ioc" },
        };

        const input = v.parse(schema, {
            ...baseOrder,
            execution: {
                type: "market_ioc",
                maxSlippage: { kind: "slippage", slippage: "0.25" },
            },
        });

        expect(input.order.execution).toMatchObject({
            case: "marketIoc",
            value: {
                maxSlippage: {
                    case: "maxSlippageTicks",
                    value: 250_000,
                },
            },
        });

        for (const bps of [0, 0.5, "0.5", 0.9, "0.9", -0.5, "-0.5"]) {
            expect(() =>
                v.parse(schema, {
                    ...baseOrder,
                    execution: {
                        type: "market_ioc",
                        maxSlippage: { kind: "bps", bps },
                    },
                }),
            ).toThrow();
        }

        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                execution: {
                    type: "market_ioc",
                    maxSlippage: { kind: "bps", bps: 1.5 },
                },
            }),
        ).toThrow("execution.maxSlippageBps must be between 1 and 10000");

        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                execution: {
                    type: "market_ioc",
                    maxSlippage: { kind: "slippage", slippage: "10000" },
                },
            }),
        ).toThrow("execution.maxSlippage.slippage exceeds the maximum supported price distance");
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                execution: {
                    type: "market_ioc",
                    maxSlippage: { kind: "ticks", ticks: 10 },
                },
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                execution: {
                    type: "market_ioc",
                    maxSlippage: { kind: "bps", bps: 10_001 },
                },
            }),
        ).toThrow("execution.maxSlippageBps must be between 1 and 10000");
    });

    it("rejects invalid decimal quantity and accepts decimal prices", () => {
        const schema = createNewOrderInputSchema(testScales());
        const baseOrder = {
            symbol: "BTC-USDT",
            side: "buy",
            qty: "0.5",
            execution: { type: "limit_gtc", price: "100" },
        } satisfies NewOrderInput;

        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                qty: "0.000000015",
            }),
        ).toThrow("qty supports at most 8 decimal places");
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                qty: "0",
            }),
        ).toThrow("qty must be greater than 0");
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                qty: "not-a-number",
            }),
        ).toThrow("qty must be a non-negative decimal number");
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                execution: { type: "limit_gtc", price: "100.0000001" },
            }),
        ).toThrow("execution.price supports at most 6 decimal places");
        expect(() =>
            v.parse(schema, {
                ...baseOrder,
                execution: { type: "limit_gtc", price: "100.001" },
            }),
        ).not.toThrow();
    });

    it("rejects invalid attached risk states", () => {
        const schema = createNewOrderInputSchema(testScales());

        const baseOrder = {
            symbol: "BTC-USDT",
            side: "buy",
            qty: "0.5",
            execution: { type: "limit_gtc", price: "100" },
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
                            kind: "distance",
                            distance: "0.5",
                        },
                    },
                },
            }),
        ).toThrow();
    });
});

describe("create result and preview schemas", () => {
    it("exposes millisecond and exact nanosecond admission timestamps", () => {
        expect(
            v.parse(createCreateOrderResultSchema(testScales(), "BTC-USDT"), {
                orderId: 11n,
                clientOrderId: "client-1",
                acceptedAt: { seconds: 1n, nanos: 250_000_000 },
                acceptedAtTsNs: 1_250_000_000n,
                resolvedBaseQtyScaled: 50_000_000n,
                submittedMaxQuoteDebitScaled: 125_500_000n,
            }),
        ).toMatchObject({
            acceptedAt: 1_250,
            acceptedAtNs: "1250000000",
            resolvedBaseQty: "0.5",
            submittedMaxQuoteDebit: "125.5",
        });
    });

    it("derives acceptedAt from nanoseconds when the protobuf timestamp is absent", () => {
        expect(
            v.parse(createCreateOrderResultSchema(testScales(), "BTC-USDT"), {
                orderId: 11n,
                clientOrderId: "",
                acceptedAtTsNs: 1_250_000_000n,
                resolvedBaseQtyScaled: 50_000_000n,
            }),
        ).toMatchObject({
            acceptedAt: 1_250,
            acceptedAtNs: "1250000000",
            resolvedBaseQty: "0.5",
        });
    });

    it("normalizes truthful preview admission fields", () => {
        const result = v.parse(createPreviewOrderResultSchema(testScales(), "BTC-USDT"), {
            resolvedBaseQtyScaled: 50_000_000n,
            protectedPriceBoundTicks: 100_250_000n,
            evaluatedAt: { seconds: 1n, nanos: 250_000_000 },
            admissible: true,
        });

        expect(result).toEqual({
            resolvedBaseQty: "0.5",
            protectedPriceBound: "100.25",
            evaluatedAt: 1_250,
            admissible: true,
            rejection: undefined,
        });
        expectTypeOf(result.evaluatedAt).toEqualTypeOf<number>();
    });

    it("keeps unresolved preview values absent", () => {
        expect(
            v.parse(createPreviewOrderResultSchema(testScales(), "BTC-USDT"), {
                admissible: false,
                evaluatedAt: { seconds: 1n, nanos: 250_000_000 },
                rejection: {
                    code: ProtoWrite.ErrorCode.BAD_QTY,
                    violations: [
                        {
                            fieldPath: "order.base_qty_scaled",
                            ruleId: "positive",
                            message: "Quantity must be positive.",
                        },
                    ],
                },
            }),
        ).toEqual({
            admissible: false,
            rejection: {
                code: "BAD_QTY",
                violations: [
                    {
                        fieldPath: "order.base_qty_scaled",
                        ruleId: "positive",
                        message: "Quantity must be positive.",
                    },
                ],
            },
            evaluatedAt: 1_250,
        });
    });

    it("requires an evaluation timestamp when preview values are unresolved", () => {
        expect(() =>
            v.parse(createPreviewOrderResultSchema(testScales(), "BTC-USDT"), {
                admissible: false,
                rejection: {
                    code: ProtoWrite.ErrorCode.BAD_QTY,
                    violations: [],
                },
            }),
        ).toThrow();
    });
});

describe("ModifyOrderInputSchema", () => {
    it("requires one order key and at least one patch field", () => {
        const schema = createModifyOrderInputSchema(testScales());

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

    it("requires the pair symbol", () => {
        const schema = createModifyOrderInputSchema(testScales());

        expect(() =>
            v.parse(schema, {
                clientOrderId: "client-1",
                newPrice: "101.25",
            }),
        ).toThrow();
    });

    it("converts client-order patches and clear-risk requests", () => {
        const schema = createModifyOrderInputSchema(testScales());

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

    it("rejects invalid decimal new quantity when present", () => {
        const schema = createModifyOrderInputSchema(testScales());

        expect(() =>
            v.parse(schema, {
                clientOrderId: "client-1",
                symbol: "BTC-USDT",
                newQty: "0.000000015",
            }),
        ).toThrow("newQty supports at most 8 decimal places");
        expect(() =>
            v.parse(schema, {
                clientOrderId: "client-1",
                symbol: "BTC-USDT",
                newQty: "0",
            }),
        ).toThrow("newQty must be greater than 0");
        expect(() =>
            v.parse(schema, {
                clientOrderId: "client-1",
                symbol: "BTC-USDT",
                newQty: "0.5",
                newPrice: "100.001",
            }),
        ).not.toThrow();
    });

    it("rejects invalid risk patch states", () => {
        const schema = createModifyOrderInputSchema(testScales());

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
                            kind: "distance",
                            distance: "0.5",
                        },
                    },
                },
            }),
        ).toThrow();
    });

    it("converts decimal risk patches to wire scaled integers", () => {
        const schema = createModifyOrderInputSchema(testScales());

        const patch = v.parse(schema, {
            orderId: "11",
            symbol: "BTC-USDT",
            risk: {
                takeProfit: {
                    triggerPrice: "105",
                    execution: { type: "limit_gtc", price: "105.5" },
                },
            },
        });

        expect(patch.newAttachedRisk).toMatchObject({
            takeProfit: {
                triggerPriceTicks: 105_000_000n,
                child: {
                    execution: {
                        case: "limitGtc",
                        value: { priceTicks: 105_500_000n },
                    },
                },
            },
        });
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
            timeInForce: ProtoWrite.TimeInForce.GTC,
            selfTradePreventionMode: ProtoWrite.SelfTradePreventionMode.EXPIRE_MAKER,
            feeAsset: ProtoWrite.FeeAsset.QUOTE,
            postOnly: false,
            origQtyScaled: 100_000_000n,
            cumQtyScaled: 0n,
            leavesQtyScaled: 100_000_000n,
            avgPriceTicks: 0n,
            priceTicks: 100_000_000n,
            createdTsNs: 1_000_000n,
            terminalTsNs: 0n,
            terminalReasonCode: 0,
            marketClientRefPriceTicks: 0n,
            marketMaxSlippageTicks: 0,
            marketMaxSlippageBps: 0,
            version: 3,
            batchRequestId: 0n,
            ...overrides,
        };
    }

    it("converts scaled wire quantities and prices to decimal strings", () => {
        const schema = createOrderSchema(testScales());

        const order = v.parse(
            schema,
            rawOrder({ cumQtyScaled: 50_000_000n, avgPriceTicks: 100_250_000n }),
        );

        expect(order).toMatchObject({
            origQty: "1",
            cumQty: "0.5",
            leavesQty: "1",
            avgPx: "100.25",
            price: "100",
            version: 3,
        });
        expect(order.marketClientRefPrice).toBeUndefined();
    });

    it("accepts unset wire versions and rejects non-integers", () => {
        const schema = createOrderSchema(testScales());

        expect(v.parse(schema, rawOrder({ version: 0 })).version).toBe(0);
        expect(() => v.parse(schema, rawOrder({ version: 1.5 }))).toThrow();
    });

    it("emits the market client reference price only when set", () => {
        const schema = createOrderSchema(testScales());

        const order = v.parse(schema, rawOrder({ marketClientRefPriceTicks: 99_500_000n }));

        expect(order.marketClientRefPrice).toBe("99.5");
    });

    it("exposes batch identity and submitted max-quote sizing when present", () => {
        const order = v.parse(
            createOrderSchema(testScales()),
            rawOrder({
                batchRequestId: 22n,
                submittedMaxQuoteDebitScaled: 125_500_000n,
            }),
        );

        expect(order).toMatchObject({
            batchRequestId: formatId(22n),
            submittedMaxQuoteDebit: "125.5",
        });
    });

    it("decodes order status through the codec", () => {
        const schema = createOrderSchema(testScales());

        const order = v.parse(schema, rawOrder({ status: ProtoRead.OrderStatus.FILLED }));

        expect(order.status).toBe("filled");
    });

    it("keeps the derived partial status for working orders with fills", () => {
        const schema = createOrderSchema(testScales());

        const order = v.parse(schema, rawOrder({ cumQtyScaled: 50_000_000n }));

        expect(order.status).toBe("partial");
    });

    it("decodes attached risk legs to explicit execution variants", () => {
        const schema = createOrderSchema(testScales());

        const order = v.parse(
            schema,
            rawOrder({
                attachedRisk: {
                    takeProfit: {
                        policy: {
                            triggerPriceTicks: 101_000_000n,
                            child: {
                                execution: {
                                    case: "limitGtc",
                                    value: {
                                        priceTicks: 102_500_000n,
                                    },
                                },
                            },
                        },
                    },
                    stopLoss: {
                        policy: {
                            triggerPriceTicks: 95_000_000n,
                            child: {
                                execution: {
                                    case: "marketIoc",
                                    value: {},
                                },
                            },
                        },
                    },
                    oco: false,
                },
            }),
        );

        expect(order.attachedRisk?.takeProfit).toMatchObject({
            triggerPrice: "101",
            execution: {
                type: "limit_gtc",
                price: "102.5",
            },
        });
        expect(order.attachedRisk?.stopLoss).toMatchObject({
            triggerPrice: "95",
            execution: {
                type: "market_ioc",
            },
        });
    });

    it("decodes attached trailing risk to decimal distance and slippage variants", () => {
        const schema = createOrderSchema(testScales());

        const order = v.parse(
            schema,
            rawOrder({
                attachedRisk: {
                    trailingStop: {
                        policy: {
                            trailingDistance: {
                                case: "trailingDistanceTicks",
                                value: 500_000n,
                            },
                            maxSlippage: { case: "maxSlippageTicks", value: 250_000 },
                            activationPriceTicks: 99_000_000n,
                        },
                    },
                    oco: false,
                },
            }),
        );

        expect(order.attachedRisk?.trailingStop).toMatchObject({
            trailingDistance: { kind: "distance", distance: "0.5" },
            maxSlippage: { kind: "slippage", slippage: "0.25" },
            activationPrice: "99",
        });

        const unsetActivation = v.parse(
            schema,
            rawOrder({
                attachedRisk: {
                    trailingStop: {
                        policy: {
                            trailingDistance: { case: "trailingDistanceBps", value: 50 },
                            maxSlippage: { case: undefined, value: undefined },
                            activationPriceTicks: 0n,
                        },
                    },
                    oco: false,
                },
            }),
        );

        expect(unsetActivation.attachedRisk?.trailingStop).toMatchObject({
            trailingDistance: { kind: "bps", bps: 50 },
        });
        expect(unsetActivation.attachedRisk?.trailingStop?.maxSlippage).toBeUndefined();
        expect(unsetActivation.attachedRisk?.trailingStop?.activationPrice).toBeUndefined();
    });

    it("decodes market max slippage ticks to a decimal slippage variant", () => {
        const schema = createOrderSchema(testScales());

        const ticksOrder = v.parse(schema, rawOrder({ marketMaxSlippageTicks: 250_000 }));
        expect(ticksOrder.marketMaxSlippage).toEqual({ kind: "slippage", slippage: "0.25" });

        const bpsOrder = v.parse(schema, rawOrder({ marketMaxSlippageBps: 25 }));
        expect(bpsOrder.marketMaxSlippage).toEqual({ kind: "bps", bps: 25 });
    });

    it("rejects orders whose symbol is unknown to the catalog", () => {
        const schema = createOrderSchema(testScales());

        expect(() => v.parse(schema, rawOrder({ symbolId: 999 }))).toThrow(
            /symbolId not found: 999/,
        );
    });

    it("preserves unspecified order status values", () => {
        const schema = createOrderSchema(testScales());

        expect(
            v.parse(schema, rawOrder({ status: ProtoRead.OrderStatus.ORDER_STATUS_UNSPECIFIED })),
        ).toMatchObject({ status: "unspecified" });
    });

    it("preserves unspecified backend enum values", () => {
        const schema = createOrderSchema(testScales());

        expect(v.parse(schema, rawOrder({ side: ProtoWrite.Side.SIDE_UNSPECIFIED }))).toMatchObject(
            { side: "unspecified" },
        );
    });
});

describe("OrderTransferSchema", () => {
    it("converts the u128 transfer amount with the ledger asset scale", () => {
        const schema = createOrderTransferSchema();

        const transfer = v.parse(schema, {
            txId: "tx-1",
            matchId: 5n,
            assetId: 1,
            amountE18: { hi: 0n, lo: 1_500_000_000_000_000_000n },
            isDebit: false,
            transferCode: TransferCode.INTERNAL_TRANSFER,
            accountCode: AccountCode.TRADING,
            tsNs: 1_000_000n,
        });

        expect(transfer).toMatchObject({
            txId: "tx-1",
            matchId: 5,
            assetId: 1,
            isDebit: false,
            amount: "1.5",
            timestamp: 1,
        });
    });

    it("decodes retained trading-withdraw request fees", () => {
        const schema = createOrderTransferSchema();

        const transfer = v.parse(schema, {
            txId: "tx-2",
            matchId: 6n,
            assetId: 1,
            amountE18: { hi: 0n, lo: 1n },
            isDebit: true,
            transferCode: TransferCode.TRADING_WITHDRAW_REQUEST_FEE,
            accountCode: AccountCode.TRADING,
            tsNs: 1_000_000n,
        });

        expect(transfer.type).toBe("trading_withdraw_request_fee");
    });
});
