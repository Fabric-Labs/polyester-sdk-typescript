import { describe, expect, expectTypeOf, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import * as v from "valibot";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    PROTOBUF_INT32_MAX,
    PROTOBUF_INT64_MAX,
    PROTOBUF_UINT32_MAX,
} from "../../shared/wire-bounds.js";
import { formatId } from "../../utils/base58-id.js";
import { parse } from "../../shared/validation.js";
import {
    BatchCancelTriggersInputSchema,
    CreateTriggerResultSchema,
    ListTriggersInputSchema,
    createCreateOcoInputSchema,
    ListTriggerEventsInputSchema,
    ResumeTriggerInputSchema,
    createCreateTriggerInputSchema,
    createModifyTriggerInputSchema,
    createTriggerEventSchema,
    createTriggerSchema,
    type BatchCancelTriggersInput,
    type CreateTriggerInput,
    type ListTriggerEventsInput,
    type ModifyTriggerInput,
    type ResumeTriggerInput,
    type Trigger,
} from "./triggers.schemas.js";

type AssertModifyTriggerInput<T extends ModifyTriggerInput> = T;
type AssertResumeTriggerInput<T extends ResumeTriggerInput> = T;

type _ValidModifyTriggerWithSymbolId = AssertModifyTriggerInput<{
    triggerId: string;
    symbolId: number;
    triggerPrice: string;
}>;

type _ValidModifyTriggerClears = AssertModifyTriggerInput<{
    triggerId: string;
    symbolId: number;
    activationPrice: { kind: "none" };
    maxSlippage: { kind: "none" };
}>;

// Omitting the symbol ID targets the trigger's own market.
type _ValidModifyTriggerWithoutSymbolId = AssertModifyTriggerInput<{
    triggerId: string;
    triggerPrice: string;
}>;

type _ValidResumeTriggerWithSymbolId = AssertResumeTriggerInput<{
    triggerId: string;
    symbolId: number;
}>;

type _ValidResumeTriggerWithoutSymbolId = AssertResumeTriggerInput<{
    triggerId: string;
}>;

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

function testScales(symbolId = btcUsdt.symbolId) {
    const catalog = createTestCatalog({ pairs: [{ ...btcUsdt, symbolId }] });
    return createCatalogSdkScales(() => catalog);
}

function baseWireTrigger(overrides: Partial<Proto.Trigger> = {}): Proto.Trigger {
    return {
        triggerId: 11n,
        subaccountId: 22n,
        symbolId: 1,
        status: Proto.TriggerStatus.STATUS_ARMED,
        qtyScaled: 50_000_000n,
        feeAsset: ProtoOrders.FeeAsset.QUOTE,
        selfTradePreventionMode: ProtoOrders.SelfTradePreventionMode.EXPIRE_MAKER,
        configuration: {
            case: "stopLoss",
            value: {
                triggerPriceTicks: 100_000_000_000n,
                triggerPriceSource: ProtoOrders.TriggerPriceSource.INDEX_PRICE,
                side: ProtoOrders.Side.SELL,
                child: {
                    execution: {
                        case: "limitGtc",
                        value: { priceTicks: 99_500_000_000n, postOnly: false },
                    },
                },
            },
        },
        clientTriggerId: "trigger-client-1",
        terminalReason: { case: undefined },
        version: 1,
        runtimeDetails: {
            case: "stop",
            value: {
                triggerPriceTicks: 100_000_000_000n,
                triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
                triggerDirection: ProtoOrders.TriggerDirection.BELOW,
            },
        },
        ...overrides,
    } as Proto.Trigger;
}

describe("ListTriggerEventsInputSchema", () => {
    it("exposes only supported event filters", () => {
        expectTypeOf<ListTriggerEventsInput["eventType"]>().toEqualTypeOf<
            | "fired"
            | "canceled"
            | "updated"
            | "failed"
            | "activated"
            | "armed"
            | "fire_refused"
            | undefined
        >();
        expect(
            v.safeParse(ListTriggerEventsInputSchema, {
                triggerId: formatId(11n),
                eventType: "unspecified",
            }).success,
        ).toBe(false);
    });

    it("normalizes page tokens and maps event filters to protobuf values", () => {
        expect(
            v.parse(ListTriggerEventsInputSchema, {
                triggerId: formatId(11n),
                eventType: "fired",
                pageToken: " cursor-1 ",
            }),
        ).toMatchObject({
            triggerId: 11n,
            eventType: Proto.TriggerEventType.EVENT_FIRED,
            pageToken: "cursor-1",
        });
        expect(v.parse(ListTriggerEventsInputSchema, { triggerId: formatId(11n) })).toMatchObject({
            triggerId: 11n,
            eventType: undefined,
            pageToken: "",
        });
        expect(
            v.parse(ListTriggerEventsInputSchema, {
                triggerId: formatId(11n),
                eventType: "failed",
            }),
        ).toMatchObject({ eventType: Proto.TriggerEventType.EVENT_FAILED });
        expect(
            v.parse(ListTriggerEventsInputSchema, {
                triggerId: formatId(11n),
                eventType: "armed",
            }),
        ).toMatchObject({ eventType: Proto.TriggerEventType.EVENT_ARMED });
    });
});

describe("CreateTriggerInputSchema", () => {
    it("names the chosen variant's missing field instead of another variant's type", () => {
        const schema = createCreateTriggerInputSchema(testScales());
        const base = { symbolId: 1, qty: "0.00036" };
        const cases = [
            [
                {
                    ...base,
                    triggerType: "twap",
                    side: "buy",
                    sliceIntervalMs: 30_000,
                    execution: { type: "market_ioc" },
                },
                'durationMs: Invalid key: Expected "durationMs"',
            ],
            [
                {
                    ...base,
                    triggerType: "take_profit",
                    side: "sell",
                    triggerPriceSource: "last",
                    execution: { type: "market_ioc" },
                },
                'triggerPrice: Invalid key: Expected "triggerPrice"',
            ],
            [
                {
                    ...base,
                    triggerType: "trailing_stop",
                    side: "buy",
                    triggerPriceSource: "last",
                    trailingDistance: { kind: "bps", bps: 5 },
                },
                'limitPrice: Invalid key: Expected "limitPrice"',
            ],
            [
                { ...base, triggerType: "ladder", side: "buy", priceMin: "1", levels: 2 },
                'priceMax: Invalid key: Expected "priceMax"',
            ],
            [
                { ...base, triggerType: "bogus" },
                "triggerType must be one of stop_loss, take_profit",
            ],
        ] as const;
        for (const [input, message] of cases) {
            expect(() => parse(schema, input)).toThrow(message);
        }
    });

    it("exposes the same conditional child execution types on either side", () => {
        type ExpectedExecution =
            | {
                  type: "market_ioc";
                  maxSlippage?:
                      | { kind: "slippage"; slippage: string }
                      | { kind: "bps"; bps: string | number }
                      | { kind: "none" };
              }
            | { type: "limit_gtc"; price: string; postOnly?: boolean }
            | { type: "limit_ioc"; price: string }
            | { type: "limit_fok"; price: string };
        type BuyStopLossInput = Extract<
            CreateTriggerInput,
            { triggerType: "stop_loss"; side: "buy" }
        >;
        type BuyTakeProfitInput = Extract<
            CreateTriggerInput,
            { triggerType: "take_profit"; side: "buy" }
        >;
        type SellStopLossInput = Extract<
            CreateTriggerInput,
            { triggerType: "stop_loss"; side: "sell" }
        >;

        expectTypeOf<BuyStopLossInput["execution"]>().toEqualTypeOf<ExpectedExecution>();
        expectTypeOf<BuyTakeProfitInput["execution"]>().toEqualTypeOf<ExpectedExecution>();
        expectTypeOf<SellStopLossInput["execution"]>().toEqualTypeOf<ExpectedExecution>();
    });

    it("requires a positive uint32 symbol ID and forwards its exact maximum", () => {
        const schema = createCreateTriggerInputSchema(testScales(PROTOBUF_UINT32_MAX));
        const input = {
            triggerType: "stop_loss",
            symbolId: PROTOBUF_UINT32_MAX,
            side: "sell",
            qty: "0.5",
            triggerPrice: "100",
            execution: { type: "market_ioc" },
        } as const;

        expect(v.parse(schema, input).trigger.symbolId).toBe(PROTOBUF_UINT32_MAX);
        expect(() => v.parse(schema, { ...input, symbolId: 0 })).toThrow();
        expect(() => v.parse(schema, { ...input, symbolId: PROTOBUF_UINT32_MAX + 1 })).toThrow();
    });

    it("builds all stop-loss and take-profit child execution variants", () => {
        const schema = createCreateTriggerInputSchema(testScales());
        const cases = [
            {
                input: {
                    triggerType: "stop_loss",
                    symbolId: 1,
                    side: "sell",
                    qty: "0.5",
                    triggerPrice: "100",
                    execution: { type: "market_ioc" },
                    clientTriggerId: " trigger-client-1 ",
                },
                expected: {
                    case: "stopLoss",
                    value: {
                        child: { execution: { case: "marketIoc" } },
                    },
                },
            },
            {
                input: {
                    triggerType: "stop_loss",
                    symbolId: 1,
                    side: "sell",
                    qty: "0.5",
                    triggerPrice: "100",
                    execution: { type: "limit_gtc", price: "99.5", postOnly: true },
                    clientTriggerId: "trigger-client-2",
                },
                expected: {
                    case: "stopLoss",
                    value: {
                        child: {
                            execution: {
                                case: "limitGtc",
                                value: { priceTicks: 99_500_000_000n, postOnly: true },
                            },
                        },
                    },
                },
            },
            {
                input: {
                    triggerType: "take_profit",
                    symbolId: 1,
                    side: "sell",
                    qty: "0.5",
                    triggerPrice: "101",
                    execution: { type: "limit_ioc", price: "100.5" },
                    clientTriggerId: "trigger-client-3",
                },
                expected: {
                    case: "takeProfit",
                    value: {
                        child: {
                            execution: {
                                case: "limitIoc",
                                value: { priceTicks: 100_500_000_000n },
                            },
                        },
                    },
                },
            },
            {
                input: {
                    triggerType: "take_profit",
                    symbolId: 1,
                    side: "buy",
                    qty: "0.5",
                    triggerPrice: "101",
                    execution: { type: "limit_fok", price: "101.5" },
                    clientTriggerId: "trigger-client-4",
                },
                expected: {
                    case: "takeProfit",
                    value: {
                        child: {
                            execution: {
                                case: "limitFok",
                                value: { priceTicks: 101_500_000_000n },
                            },
                        },
                    },
                },
            },
        ] as const;

        for (const testCase of cases) {
            expect(v.parse(schema, testCase.input)).toMatchObject({
                trigger: {
                    symbolId: 1,
                    qtyScaled: 50_000_000n,
                    feeAsset: ProtoOrders.FeeAsset.QUOTE,
                    selfTradePreventionMode: ProtoOrders.SelfTradePreventionMode.EXPIRE_MAKER,
                    strategy: {
                        ...testCase.expected,
                        value: {
                            triggerPriceTicks:
                                testCase.input.triggerType === "stop_loss"
                                    ? 100_000_000_000n
                                    : 101_000_000_000n,
                            side:
                                testCase.input.side === "sell"
                                    ? ProtoOrders.Side.SELL
                                    : ProtoOrders.Side.BUY,
                            ...testCase.expected.value,
                        },
                    },
                },
            });
        }
    });

    it("caps a market child's bps slippage at 10000 for a buy and 9999 for a sell", () => {
        const schema = createCreateTriggerInputSchema(testScales());

        for (const triggerType of ["stop_loss", "take_profit"] as const) {
            const input = {
                triggerType,
                symbolId: 1,
                qty: "0.5",
                triggerPrice: "100",
            } as const;
            const withSlippage = (side: "buy" | "sell", bps: number) =>
                v.parse(schema, {
                    ...input,
                    side,
                    execution: { type: "market_ioc", maxSlippage: { kind: "bps", bps } },
                });

            expect(withSlippage("buy", 10_000).trigger.strategy).toMatchObject({
                value: {
                    side: ProtoOrders.Side.BUY,
                    child: {
                        execution: {
                            case: "marketIoc",
                            value: { maxSlippage: { case: "maxSlippageBps", value: 10_000 } },
                        },
                    },
                },
            });
            expect(() => withSlippage("buy", 10_001)).toThrow(
                "maxSlippageBps must be between 1 and 10000",
            );
            expect(withSlippage("sell", 9_999).trigger.strategy).toMatchObject({
                value: {
                    child: {
                        execution: {
                            value: { maxSlippage: { case: "maxSlippageBps", value: 9_999 } },
                        },
                    },
                },
            });
            expect(() => withSlippage("sell", 10_000)).toThrow(
                "maxSlippageBps must be between 1 and 9999",
            );
            expect(
                v.parse(schema, { ...input, side: "buy", execution: { type: "market_ioc" } })
                    .trigger.strategy,
            ).toMatchObject({
                value: {
                    child: {
                        execution: {
                            case: "marketIoc",
                            value: { maxSlippage: { case: undefined } },
                        },
                    },
                },
            });
        }
    });

    it("normalizes explicit fee asset and self-trade prevention on the intent", () => {
        const schema = createCreateTriggerInputSchema(testScales());

        expect(
            v.parse(schema, {
                triggerType: "take_profit",
                symbolId: 1,
                side: "buy",
                qty: "0.5",
                triggerPrice: "101",
                execution: { type: "limit_gtc", price: "101.5" },
                feeAsset: "base",
                selfTradePreventionMode: "expire_both",
                clientTriggerId: "trigger-client-1",
            }),
        ).toMatchObject({
            trigger: {
                feeAsset: ProtoOrders.FeeAsset.BASE,
                selfTradePreventionMode: ProtoOrders.SelfTradePreventionMode.EXPIRE_BOTH,
            },
        });
    });

    it("normalizes trailing distance and maximum slippage variants", () => {
        const schema = createCreateTriggerInputSchema(testScales());

        const priceDistanceInput = v.parse(schema, {
            triggerType: "trailing_stop",
            symbolId: 1,
            qty: "0.25",
            trailingDistance: { kind: "distance", distance: "0.5" },
            maxSlippage: { kind: "bps", bps: 125 },
            clientTriggerId: "trigger-client-2",
        });
        const bpsDistanceInput = v.parse(schema, {
            triggerType: "trailing_stop",
            symbolId: 1,
            qty: "0.25",
            trailingDistance: { kind: "bps", bps: 150 },
            activationPrice: "99",
            maxSlippage: { kind: "slippage", slippage: "0.25" },
            clientTriggerId: "trigger-client-3",
        });

        expect(priceDistanceInput).toMatchObject({
            trigger: {
                strategy: {
                    case: "trailingStop",
                    value: {
                        side: ProtoOrders.Side.SELL,
                        trailingDistance: {
                            case: "trailingDistanceTicks",
                            value: 500_000_000n,
                        },
                        activationPriceTicks: 0n,
                        maxSlippage: { case: "maxSlippageBps", value: 125 },
                    },
                },
            },
        });
        expect(bpsDistanceInput).toMatchObject({
            trigger: {
                strategy: {
                    case: "trailingStop",
                    value: {
                        side: ProtoOrders.Side.SELL,
                        trailingDistance: { case: "trailingDistanceBps", value: 150 },
                        activationPriceTicks: 99_000_000_000n,
                        maxSlippage: { case: "maxSlippageTicks", value: 250_000_000n },
                    },
                },
            },
        });
    });

    it("builds a buy trailing stop with its maximum price", () => {
        const schema = createCreateTriggerInputSchema(testScales());
        const input = {
            triggerType: "trailing_stop",
            symbolId: 1,
            side: "buy",
            qty: "0.25",
            feeAsset: "base",
            trailingDistance: { kind: "bps", bps: 150 },
            activationPrice: "99",
            limitPrice: "101.5",
        } as const;

        expect(v.parse(schema, input).trigger.strategy).toMatchObject({
            case: "trailingStop",
            value: {
                side: ProtoOrders.Side.BUY,
                activationPriceTicks: 99_000_000_000n,
                limitPriceTicks: 101_500_000_000n,
            },
        });
        expect(v.parse(schema, { ...input, limitPrice: "99" }).trigger.strategy).toMatchObject({
            value: { limitPriceTicks: 99_000_000_000n },
        });
        expect(() => v.parse(schema, { ...input, limitPrice: "98.99" })).toThrow(
            "limitPrice must be at least activationPrice",
        );
        const { limitPrice: _limitPrice, ...withoutLimitPrice } = input;
        expect(() => v.parse(schema, withoutLimitPrice)).toThrow();
    });

    it("sends the trigger price source and rejects the unsupported mark price", () => {
        const schema = createCreateTriggerInputSchema(testScales());
        const stopLoss = {
            triggerType: "stop_loss",
            symbolId: 1,
            side: "sell",
            qty: "0.25",
            triggerPrice: "95",
            execution: { type: "market_ioc" },
        } as const;
        const trailingStop = {
            triggerType: "trailing_stop",
            symbolId: 1,
            qty: "0.25",
            trailingDistance: { kind: "bps", bps: 150 },
        } as const;

        // Omitted leaves the wire default, which watches the last price.
        expect(v.parse(schema, stopLoss).trigger.strategy.value).toMatchObject({
            triggerPriceSource: undefined,
        });
        expect(
            v.parse(schema, { ...stopLoss, triggerPriceSource: "index" }).trigger.strategy.value,
        ).toMatchObject({ triggerPriceSource: ProtoOrders.TriggerPriceSource.INDEX_PRICE });
        expect(
            v.parse(schema, { ...trailingStop, triggerPriceSource: "index" }).trigger.strategy
                .value,
        ).toMatchObject({ triggerPriceSource: ProtoOrders.TriggerPriceSource.INDEX_PRICE });
        expect(() => v.parse(schema, { ...stopLoss, triggerPriceSource: "mark" })).toThrow();
        expect(() => v.parse(schema, { ...trailingStop, triggerPriceSource: "mark" })).toThrow();
    });

    it("rejects a maximum price on a sell trailing stop", () => {
        const schema = createCreateTriggerInputSchema(testScales());
        const input = {
            triggerType: "trailing_stop",
            symbolId: 1,
            qty: "0.25",
            trailingDistance: { kind: "bps", bps: 150 },
        } as const;

        expect(v.parse(schema, { ...input, side: "sell" }).trigger.strategy).toMatchObject({
            value: { side: ProtoOrders.Side.SELL, limitPriceTicks: 0n },
        });
        expect(() => v.parse(schema, { ...input, limitPrice: "101" })).toThrow();
        expect(() => v.parse(schema, { ...input, side: "sell", limitPrice: "101" })).toThrow();
    });

    it.each(["buy", "sell"] as const)("caps a %s trailing stop's slippage at 9999 bps", (side) => {
        const schema = createCreateTriggerInputSchema(testScales());
        const input = {
            triggerType: "trailing_stop",
            symbolId: 1,
            qty: "0.25",
            trailingDistance: { kind: "bps", bps: 150 },
            ...(side === "buy" ? { side, limitPrice: "101" } : { side }),
        } as const;

        expect(
            v.parse(schema, {
                ...input,
                maxSlippage: { kind: "bps", bps: 9_999 },
            }),
        ).toMatchObject({
            trigger: {
                strategy: {
                    case: "trailingStop",
                    value: {
                        maxSlippage: {
                            case: "maxSlippageBps",
                            value: 9_999,
                        },
                    },
                },
            },
        });
        expect(() =>
            v.parse(schema, {
                ...input,
                maxSlippage: { kind: "bps", bps: 10_000 },
            }),
        ).toThrow("maxSlippageBps must be between 1 and 9999");
    });

    it("builds explicit TWAP execution and ladder strategies", () => {
        const schema = createCreateTriggerInputSchema(testScales());

        expect(
            v.parse(schema, {
                triggerType: "twap",
                symbolId: 1,
                side: "buy",
                qty: "1",
                durationMs: "60000",
                sliceIntervalMs: 5000,
                execution: { type: "limit_gtc", price: "100.25" },
            }),
        ).toMatchObject({
            trigger: {
                strategy: {
                    case: "twap",
                    value: {
                        side: ProtoOrders.Side.BUY,
                        durationMs: 60_000n,
                        sliceIntervalMs: 5_000n,
                        execution: {
                            case: "limitGtc",
                            value: { priceTicks: 100_250_000_000n },
                        },
                    },
                },
            },
        });
        expect(
            v.parse(schema, {
                triggerType: "ladder",
                symbolId: 1,
                side: "buy",
                qty: "1",
                priceMin: "99",
                priceMax: "101",
                levels: "5",
                postOnly: true,
            }),
        ).toMatchObject({
            trigger: {
                strategy: {
                    case: "ladder",
                    value: {
                        side: ProtoOrders.Side.BUY,
                        priceMinTicks: 99_000_000_000n,
                        priceMaxTicks: 101_000_000_000n,
                        levels: 5,
                        postOnly: true,
                    },
                },
            },
        });
    });

    it("keeps TWAP market-slice slippage bounds distinct from omission", () => {
        const schema = createCreateTriggerInputSchema(testScales());
        const input = {
            triggerType: "twap",
            symbolId: 1,
            side: "buy",
            qty: "1",
            durationMs: 60_000,
            sliceIntervalMs: 5_000,
        } as const;
        const cases = [
            {
                execution: { type: "market_ioc" },
                expected: { case: undefined },
            },
            {
                execution: {
                    type: "market_ioc",
                    maxSlippage: { kind: "slippage", slippage: "9223372036.854775807" },
                },
                expected: { case: "maxSlippageTicks", value: PROTOBUF_INT64_MAX },
            },
            {
                execution: { type: "market_ioc", maxSlippage: { kind: "bps", bps: 0 } },
                rejects: true,
            },
            {
                execution: { type: "market_ioc", maxSlippage: { kind: "bps", bps: 10_001 } },
                rejects: true,
            },
            {
                execution: {
                    type: "market_ioc",
                    maxSlippage: { kind: "slippage", slippage: "9223372036.854775808" },
                },
                rejects: true,
            },
        ] as const;

        for (const testCase of cases) {
            if ("rejects" in testCase) {
                expect(() =>
                    v.parse(schema, { ...input, execution: testCase.execution }),
                ).toThrow();
            } else {
                expect(
                    v.parse(schema, { ...input, execution: testCase.execution }).trigger.strategy,
                ).toMatchObject({
                    case: "twap",
                    value: {
                        execution: { case: "marketIoc", value: { maxSlippage: testCase.expected } },
                    },
                });
            }
        }
    });

    it("rejects invalid precision, timing, and ladder bounds", () => {
        const schema = createCreateTriggerInputSchema(testScales());
        const baseStop = {
            triggerType: "stop_loss",
            symbolId: 1,
            side: "sell",
            qty: "0.5",
            triggerPrice: "100",
            execution: { type: "limit_gtc", price: "99.5" },
        } as const;

        expect(() => v.parse(schema, { ...baseStop, qty: "0.000000015" })).toThrow(
            "qty supports at most 8 decimal places",
        );
        expect(() =>
            v.parse(schema, {
                ...baseStop,
                execution: { type: "limit_gtc", price: "99.5000000001" },
            }),
        ).toThrow("execution.price supports at most 9 decimal places");
        expect(() =>
            v.parse(schema, {
                triggerType: "twap",
                symbolId: 1,
                side: "buy",
                qty: "1",
                durationMs: 500,
                sliceIntervalMs: 100,
                execution: { type: "market_ioc" },
            }),
        ).toThrow("durationMs must be between 1000");
        expect(() =>
            v.parse(schema, {
                triggerType: "twap",
                symbolId: 1,
                side: "buy",
                qty: "1",
                durationMs: "9223372036854775808",
                sliceIntervalMs: 100,
                execution: { type: "market_ioc" },
            }),
        ).toThrow("durationMs must be between 1000");
        expect(() =>
            v.parse(schema, {
                triggerType: "twap",
                symbolId: 1,
                side: "buy",
                qty: "1",
                durationMs: 1e300,
                sliceIntervalMs: 100,
                execution: { type: "market_ioc" },
            }),
        ).toThrow("durationMs must be between 1000");
        expect(() =>
            v.parse(schema, {
                triggerType: "ladder",
                symbolId: 1,
                side: "buy",
                qty: "1",
                priceMin: "99",
                priceMax: "101",
                levels: 1,
            }),
        ).toThrow("levels must be between 2 and 100");
        expect(() =>
            v.parse(schema, {
                triggerType: "ladder",
                symbolId: 1,
                side: "buy",
                qty: "1",
                priceMin: "101",
                priceMax: "101",
                levels: 5,
            }),
        ).toThrow("priceMin must be less than priceMax");
        expect(() =>
            v.parse(schema, {
                triggerType: "trailing_stop",
                symbolId: 1,
                side: "sell",
                qty: "1",
                trailingDistance: {
                    kind: "bps",
                    bps: (PROTOBUF_INT32_MAX + 1n).toString(),
                },
            }),
        ).toThrow();
    });
});

describe("ListTriggersInputSchema", () => {
    it("accepts the uint32 symbol ID maximum and rejects one over", () => {
        expect(v.parse(ListTriggersInputSchema, { symbolId: PROTOBUF_UINT32_MAX }).symbolId).toBe(
            PROTOBUF_UINT32_MAX,
        );
        expect(() => v.parse(ListTriggersInputSchema, { symbolId: 0 })).toThrow();
        expect(() =>
            v.parse(ListTriggersInputSchema, { symbolId: PROTOBUF_UINT32_MAX + 1 }),
        ).toThrow();
    });
});

describe("ModifyTriggerInputSchema", () => {
    it("requires at least one patch field", () => {
        const schema = createModifyTriggerInputSchema(testScales());

        expect(() => v.parse(schema, { triggerId: formatId(11n), symbolId: 1 })).toThrow(
            "At least one patch field is required",
        );
    });

    it("converts decimal patch fields", () => {
        const schema = createModifyTriggerInputSchema(testScales());

        expect(
            v.parse(schema, {
                triggerId: formatId(11n),
                symbolId: 1,
                account: { subaccountId: formatId(22n) },
                triggerPrice: "101.25",
                trailingDistance: { kind: "distance", distance: "0.5" },
                maxSlippage: { kind: "bps", bps: 25 },
            }),
        ).toMatchObject({
            triggerId: 11n,
            symbolId: 1,
            subaccountId: 22n,
            triggerPriceTicks: 101_250_000_000n,
            trailingDistance: { case: "trailingDistanceTicks", value: 500_000_000n },
            maxSlippage: { case: "maxSlippageBps", value: 25 },
        });
    });

    it("accepts a 10000 bps distance and a buy market child's 10000 bps slippage", () => {
        const schema = createModifyTriggerInputSchema(testScales());
        const input = { triggerId: formatId(11n), symbolId: 1 };

        expect(
            v.parse(schema, {
                ...input,
                trailingDistance: { kind: "bps", bps: 10_000 },
            }).trailingDistance,
        ).toEqual({ case: "trailingDistanceBps", value: 10_000 });
        expect(() =>
            v.parse(schema, {
                ...input,
                trailingDistance: { kind: "bps", bps: 10_001 },
            }),
        ).toThrow("trailingDistanceBps must be between 1 and 10000");
        for (const bps of [9_999, 10_000, "10000"]) {
            expect(
                v.parse(schema, {
                    ...input,
                    maxSlippage: { kind: "bps", bps },
                }).maxSlippage,
            ).toEqual({ case: "maxSlippageBps", value: Number(bps) });
        }
        expect(() =>
            v.parse(schema, {
                ...input,
                maxSlippage: { kind: "bps", bps: 10_001 },
            }),
        ).toThrow("maxSlippageBps must be between 1 and 10000");
    });

    it("rejects a child limit price patch, which is fixed at creation", () => {
        const schema = createModifyTriggerInputSchema(testScales());

        expect(() =>
            v.parse(schema, { triggerId: formatId(11n), symbolId: 1, limitPrice: "101" }),
        ).toThrow();
    });

    it("distinguishes omitted fields from explicit activation-price and max-slippage clears", () => {
        const schema = createModifyTriggerInputSchema(testScales());

        expect(
            v.parse(schema, {
                triggerId: formatId(11n),
                symbolId: 1,
                triggerPrice: "100",
            }),
        ).toMatchObject({
            activationPriceTicks: undefined,
            maxSlippage: { case: undefined, value: undefined },
        });
        expect(
            v.parse(schema, {
                triggerId: formatId(11n),
                symbolId: 1,
                activationPrice: { kind: "none" },
                maxSlippage: { kind: "none" },
            }),
        ).toMatchObject({
            activationPriceTicks: 0n,
            maxSlippage: { case: "maxSlippageTicks", value: 0n },
        });
    });

    it("defaults an omitted symbol ID to the trigger's market and bounds a given one", () => {
        const schema = createModifyTriggerInputSchema(testScales());

        expect(v.parse(schema, { triggerId: formatId(11n), triggerPrice: "101.25" }).symbolId).toBe(
            0,
        );
        expect(() =>
            v.parse(schema, {
                triggerId: formatId(11n),
                symbolId: 0,
                triggerPrice: "101.25",
            }),
        ).toThrow();
        expect(
            v.parse(schema, {
                triggerId: formatId(11n),
                symbolId: PROTOBUF_UINT32_MAX,
                triggerPrice: "101.25",
            }).symbolId,
        ).toBe(PROTOBUF_UINT32_MAX);
        expect(() =>
            v.parse(schema, {
                triggerId: formatId(11n),
                symbolId: PROTOBUF_UINT32_MAX + 1,
                triggerPrice: "101.25",
            }),
        ).toThrow();
    });
});

describe("ResumeTriggerInputSchema", () => {
    it("forwards an optional positive symbol ID", () => {
        expect(v.parse(ResumeTriggerInputSchema, { triggerId: formatId(11n) })).toEqual({
            triggerId: 11n,
            subaccountId: undefined,
        });
        expect(() =>
            v.parse(ResumeTriggerInputSchema, { triggerId: formatId(11n), symbolId: 0 }),
        ).toThrow();
        expect(
            v.parse(ResumeTriggerInputSchema, {
                triggerId: formatId(11n),
                symbolId: 1,
                account: { subaccountId: formatId(22n) },
            }),
        ).toEqual({ triggerId: 11n, symbolId: 1, subaccountId: 22n });
        expect(
            v.parse(ResumeTriggerInputSchema, {
                triggerId: formatId(11n),
                symbolId: PROTOBUF_UINT32_MAX,
            }).symbolId,
        ).toBe(PROTOBUF_UINT32_MAX);
        expect(() =>
            v.parse(ResumeTriggerInputSchema, {
                triggerId: formatId(11n),
                symbolId: PROTOBUF_UINT32_MAX + 1,
            }),
        ).toThrow();
    });
});

describe("Trigger result and output schemas", () => {
    it("parses creation as an admission acknowledgement", () => {
        expect(
            v.parse(CreateTriggerResultSchema, {
                triggerId: 11n,
                clientTriggerId: "trigger-client-1",
                acceptedAt: { seconds: 1n, nanos: 250_000_000 },
                acceptedAtTsNs: 1_250_000_000n,
            }),
        ).toMatchObject({
            clientTriggerId: "trigger-client-1",
            acceptedAt: 1_250,
            acceptedAtNs: "1250000000",
        });
    });

    it("derives creation time from nanoseconds when the protobuf timestamp is absent", () => {
        expect(
            v.parse(CreateTriggerResultSchema, {
                triggerId: 11n,
                clientTriggerId: "trigger-client-1",
                acceptedAtTsNs: 1_250_000_000n,
            }),
        ).toMatchObject({
            clientTriggerId: "trigger-client-1",
            acceptedAt: 1_250,
            acceptedAtNs: "1250000000",
        });
    });

    it("preserves millisecond precision in trigger protobuf timestamps", () => {
        const output = v.parse(
            createTriggerSchema(testScales()),
            baseWireTrigger({
                createdAt: create(TimestampSchema, { seconds: 1n, nanos: 234_000_000 }),
                updatedAt: create(TimestampSchema, { seconds: 2n, nanos: 345_000_000 }),
                armedAt: create(TimestampSchema, { seconds: 3n, nanos: 456_000_000 }),
                completedAt: create(TimestampSchema, { seconds: 4n, nanos: 567_000_000 }),
            }),
        );

        expect(output).toMatchObject({
            createdTs: 1_234,
            updatedTs: 2_345,
            armedTs: 3_456,
            completedTs: 4_567,
        });
    });

    it("converts conditional configuration and stop runtime details independently", () => {
        const output = v.parse(createTriggerSchema(testScales()), baseWireTrigger());
        type HasChildOrderIds = "childOrderIds" extends keyof Trigger ? true : false;

        expect(output).toMatchObject({
            status: "armed",
            qty: "0.5",
            configuration: {
                type: "stop_loss",
                side: "sell",
                triggerPrice: "100",
                triggerPriceSource: "index",
                execution: {
                    type: "limit_gtc",
                    price: "99.5",
                    postOnly: false,
                },
            },
            runtimeDetails: {
                case: "stop",
                triggerPrice: "100",
                triggerPriceSource: "last",
                triggerDirection: "below",
            },
        });
        expect(output).not.toHaveProperty("triggerType");
        expect(output).not.toHaveProperty("symbol");
        expect(output).not.toHaveProperty("side");
        expect(output).not.toHaveProperty("orderType");
        expect(output).not.toHaveProperty("timeInForce");
        expect(output).not.toHaveProperty("details");
        expect(output).not.toHaveProperty("childOrderIds");
        expectTypeOf<HasChildOrderIds>().toEqualTypeOf<false>();
    });

    it("converts trailing configuration and runtime state", () => {
        const output = v.parse(
            createTriggerSchema(testScales()),
            baseWireTrigger({
                status: Proto.TriggerStatus.STATUS_CANCELED,
                configuration: {
                    case: "trailingStop",
                    value: create(Proto.TrailingStopTriggerSchema, {
                        side: ProtoOrders.Side.SELL,
                        trailingDistance: { case: "trailingDistanceBps", value: 200 },
                        activationPriceTicks: 99_000_000_000n,
                        maxSlippage: { case: "maxSlippageTicks", value: 250_000_000n },
                        triggerPriceSource: ProtoOrders.TriggerPriceSource.MARK_PRICE,
                    }),
                },
                runtimeDetails: {
                    case: "trailing",
                    value: create(Proto.TrailingDetailsSchema, {
                        trailingDistanceTicks: 0n,
                        activationPriceTicks: 99_000_000_000n,
                        peakPriceTicks: 100_500_000_000n,
                        troughPriceTicks: 0n,
                        trailingDistanceBps: 200,
                        maxSlippageTicks: 250_000_000n,
                        maxSlippageBps: 0,
                        triggerPriceSource: ProtoOrders.TriggerPriceSource.LAST_PRICE,
                        triggerDirection:
                            ProtoOrders.TriggerDirection.TRIGGER_DIRECTION_UNSPECIFIED,
                    }),
                },
            }),
        );

        expect(output).toMatchObject({
            status: "canceled",
            configuration: {
                type: "trailing_stop",
                side: "sell",
                trailingDistance: { kind: "bps", bps: 200 },
                activationPrice: "99",
                maxSlippage: { kind: "slippage", slippage: "0.25" },
                triggerPriceSource: "mark",
            },
            runtimeDetails: {
                case: "trailing",
                trailingDistanceBps: 200,
                activationPrice: "99",
                peakPrice: "100.5",
                troughPrice: undefined,
                maxSlippage: "0.25",
                triggerDirection: "unspecified",
                triggerPrice: undefined,
            },
        });
    });

    it("converts a buy trailing stop's maximum price and a market child's slippage cap", () => {
        const trailing = v.parse(
            createTriggerSchema(testScales()),
            baseWireTrigger({
                configuration: {
                    case: "trailingStop",
                    value: create(Proto.TrailingStopTriggerSchema, {
                        side: ProtoOrders.Side.BUY,
                        trailingDistance: { case: "trailingDistanceBps", value: 200 },
                        limitPriceTicks: 101_500_000_000n,
                    }),
                },
            }),
        );
        const stopLoss = v.parse(
            createTriggerSchema(testScales()),
            baseWireTrigger({
                configuration: {
                    case: "stopLoss",
                    value: create(Proto.ConditionalTriggerSchema, {
                        side: ProtoOrders.Side.BUY,
                        triggerPriceTicks: 100_000_000_000n,
                        child: {
                            execution: {
                                case: "marketIoc",
                                value: create(Proto.TriggerMarketIocSchema, {
                                    maxSlippage: { case: "maxSlippageBps", value: 10_000 },
                                }),
                            },
                        },
                    }),
                },
            }),
        );

        expect(trailing.configuration).toMatchObject({
            type: "trailing_stop",
            side: "buy",
            limitPrice: "101.5",
        });
        expect(stopLoss.configuration).toMatchObject({
            type: "stop_loss",
            side: "buy",
            execution: { type: "market_ioc", maxSlippage: { kind: "bps", bps: 10_000 } },
        });
    });

    it("exposes the armed trailing trigger threshold at the price scale", () => {
        const output = v.parse(
            createTriggerSchema(testScales()),
            baseWireTrigger({
                status: Proto.TriggerStatus.STATUS_ARMED,
                runtimeDetails: {
                    case: "trailing",
                    value: create(Proto.TrailingDetailsSchema, {
                        trailingDistanceTicks: 500_000_000n,
                        peakPriceTicks: 100_500_000_000n,
                        triggerPriceTicks: 100_000_000_001n,
                    }),
                },
            }),
        );

        expect(output.runtimeDetails).toMatchObject({
            case: "trailing",
            peakPrice: "100.5",
            triggerPrice: "100.000000001",
        });
    });

    it("converts TWAP and ladder configuration and runtime state", () => {
        const schema = createTriggerSchema(testScales());
        const twap = v.parse(
            schema,
            baseWireTrigger({
                qtyScaled: 100_000_000n,
                configuration: {
                    case: "twap",
                    value: create(Proto.TwapTriggerSchema, {
                        side: ProtoOrders.Side.BUY,
                        durationMs: 60_000n,
                        sliceIntervalMs: 5_000n,
                        execution: {
                            case: "marketIoc",
                            value: create(Proto.TwapMarketIocSchema, {
                                maxSlippage: { case: "maxSlippageBps", value: 125 },
                            }),
                        },
                    }),
                },
                runtimeDetails: {
                    case: "twapState",
                    value: create(Proto.TwapDetailsSchema, {
                        twapDurationMs: 60_000n,
                        twapSliceIntervalMs: 5_000n,
                        sliceIdx: 2,
                        sliceCount: 12,
                        executedQtyScaled: 25_000_000n,
                    }),
                },
            }),
        );
        const ladder = v.parse(
            schema,
            baseWireTrigger({
                configuration: {
                    case: "ladder",
                    value: create(Proto.LadderTriggerSchema, {
                        side: ProtoOrders.Side.SELL,
                        priceMinTicks: 99_000_000_000n,
                        priceMaxTicks: 101_000_000_000n,
                        levels: 5,
                        postOnly: true,
                    }),
                },
                runtimeDetails: {
                    case: "ladderState",
                    value: create(Proto.LadderDetailsSchema, {
                        ladderPriceMinTicks: 99_000_000_000n,
                        ladderPriceMaxTicks: 101_000_000_000n,
                        ladderLevels: 5,
                        ladderDistribution: Proto.LadderDistribution.LINEAR,
                        executedQtyScaled: 25_000_000n,
                        executedLevels: 2,
                    }),
                },
            }),
        );

        expect(twap).toMatchObject({
            qty: "1",
            configuration: {
                type: "twap",
                side: "buy",
                durationMs: 60_000,
                sliceIntervalMs: 5_000,
                execution: { type: "market_ioc", maxSlippage: { kind: "bps", bps: 125 } },
            },
            runtimeDetails: {
                case: "twap",
                sliceIdx: 2,
                sliceCount: 12,
                executedQty: "0.25",
            },
        });
        expect(ladder).toMatchObject({
            configuration: {
                type: "ladder",
                side: "sell",
                priceMin: "99",
                priceMax: "101",
                levels: 5,
                postOnly: true,
            },
            runtimeDetails: {
                case: "ladder",
                ladderPriceMin: "99",
                ladderPriceMax: "101",
                ladderLevels: 5,
                ladderDistribution: "linear",
                executedQty: "0.25",
                executedLevels: 2,
            },
        });
    });

    it("preserves unspecified output enums", () => {
        const triggerSchema = createTriggerSchema(testScales());
        const triggerEventSchema = createTriggerEventSchema(testScales());

        expect(
            v.parse(
                triggerSchema,
                baseWireTrigger({
                    status: Proto.TriggerStatus.STATUS_UNSPECIFIED,
                    configuration: { case: undefined },
                    runtimeDetails: { case: undefined },
                }),
            ),
        ).toMatchObject({
            status: "unspecified",
            configuration: { type: "unspecified" },
            runtimeDetails: { case: undefined },
        });
        expect(
            v.parse(triggerEventSchema, {
                triggerId: 11n,
                subaccountId: 22n,
                symbolId: 1,
                triggerType: Proto.TriggerType.STOP_LOSS,
                eventType: Proto.TriggerEventType.EVENT_UNSPECIFIED,
                tsNs: 1_000_000n,
                childSeq: 1,
                childOrderId: 0n,
                firePriceTicks: 0n,
                terminalReason: { case: undefined },
            }),
        ).toMatchObject({ eventType: "unspecified" });
    });

    it("maps trailing activation events", () => {
        expect(
            v.parse(createTriggerEventSchema(testScales()), {
                triggerId: 11n,
                subaccountId: 22n,
                symbolId: 1,
                triggerType: Proto.TriggerType.TRAILING_STOP,
                eventType: Proto.TriggerEventType.EVENT_ACTIVATED,
                tsNs: 1_000_000n,
                childSeq: 0,
                childOrderId: 0n,
                terminalReason: { case: undefined },
            }),
        ).toMatchObject({ eventType: "activated", childOrderId: undefined });
    });

    it("maps fire refused events with their reason, keeping unknown reasons", () => {
        const schema = createTriggerEventSchema(testScales());
        const refused = (fireRefusalReason?: number) =>
            v.parse(schema, {
                triggerId: 11n,
                subaccountId: 22n,
                symbolId: 1,
                triggerType: Proto.TriggerType.STOP_LOSS,
                eventType: Proto.TriggerEventType.EVENT_FIRE_REFUSED,
                tsNs: 1_000_000n,
                childSeq: 2,
                childOrderId: 0n,
                terminalReason: { case: undefined },
                fireRefusalReason,
            });

        expect(refused(Proto.TriggerFailureReason.ACCOUNT_REPAIRING)).toMatchObject({
            eventType: "fire_refused",
            childSeq: 2,
            childOrderId: undefined,
            failureReason: undefined,
            fireRefusalReason: "account_repairing",
        });
        expect(refused(Proto.TriggerFailureReason.SELF_TRADE_PREVENTED)).toMatchObject({
            eventType: "fire_refused",
            fireRefusalReason: "self_trade_prevented",
        });
        expect(refused(212)).toMatchObject({ fireRefusalReason: "unspecified" });
        expect(refused()).toMatchObject({ fireRefusalReason: undefined });
    });

    it("maps attached leg armed events", () => {
        expect(
            v.parse(createTriggerEventSchema(testScales()), {
                triggerId: 11n,
                subaccountId: 22n,
                symbolId: 1,
                triggerType: Proto.TriggerType.TAKE_PROFIT,
                eventType: Proto.TriggerEventType.EVENT_ARMED,
                tsNs: 1_000_000n,
                childSeq: 0,
                childOrderId: 0n,
                terminalReason: { case: undefined },
            }),
        ).toMatchObject({ eventType: "armed", childOrderId: undefined });
    });

    it("accepts TWAP events without a conditional fire price", () => {
        const triggerEventSchema = createTriggerEventSchema(testScales());

        expect(
            v.parse(triggerEventSchema, {
                triggerId: 11n,
                subaccountId: 22n,
                symbolId: 1,
                triggerType: Proto.TriggerType.TWAP,
                eventType: Proto.TriggerEventType.EVENT_FIRED,
                tsNs: 1_000_000n,
                childSeq: 1,
                childOrderId: 33n,
                terminalReason: { case: undefined },
            }),
        ).toMatchObject({ triggerType: "twap", firePrice: undefined });
    });

    it("maps failed trigger events with their typed failure reason", () => {
        const triggerEventSchema = createTriggerEventSchema(testScales());

        expect(
            v.parse(triggerEventSchema, {
                triggerId: 11n,
                subaccountId: 22n,
                symbolId: 1,
                triggerType: Proto.TriggerType.TWAP,
                eventType: Proto.TriggerEventType.EVENT_FAILED,
                tsNs: 1_000_000n,
                childSeq: 2,
                childOrderId: 0n,
                terminalReason: {
                    case: "failureReason",
                    value: Proto.TriggerFailureReason.POLICY_MAX_OPEN_ORDERS,
                },
            }),
        ).toMatchObject({
            eventType: "failed",
            cancelReason: undefined,
            failureReason: "policy_max_open_orders",
            childOrderId: undefined,
        });
    });

    it("maps canceled trigger events and triggers with their typed cancel reason", () => {
        const triggerEventSchema = createTriggerEventSchema(testScales());

        expect(
            v.parse(triggerEventSchema, {
                triggerId: 11n,
                subaccountId: 22n,
                symbolId: 1,
                triggerType: Proto.TriggerType.STOP_LOSS,
                eventType: Proto.TriggerEventType.EVENT_CANCELED,
                tsNs: 1_000_000n,
                childSeq: 0,
                childOrderId: 0n,
                terminalReason: {
                    case: "cancelReason",
                    value: Proto.TriggerCancelReason.OCO,
                },
            }),
        ).toMatchObject({
            eventType: "canceled",
            cancelReason: "oco",
            failureReason: undefined,
        });

        expect(
            v.parse(
                createTriggerSchema(testScales()),
                baseWireTrigger({
                    status: Proto.TriggerStatus.STATUS_CANCELED,
                    terminalReason: {
                        case: "cancelReason",
                        value: Proto.TriggerCancelReason.USER_REQUEST,
                    },
                }),
            ),
        ).toMatchObject({ status: "canceled", cancelReason: "user_request" });

        expect(
            v.parse(
                createTriggerSchema(testScales()),
                baseWireTrigger({
                    status: Proto.TriggerStatus.STATUS_CANCELED,
                    terminalReason: {
                        case: "cancelReason",
                        value: Proto.TriggerCancelReason.SELF_TRADE_PREVENTION,
                    },
                }),
            ),
        ).toMatchObject({ status: "canceled", cancelReason: "self_trade_prevention" });

        expect(
            v.parse(
                createTriggerSchema(testScales()),
                baseWireTrigger({
                    status: Proto.TriggerStatus.STATUS_CANCELED,
                    terminalReason: {
                        case: "cancelReason",
                        value: Proto.TriggerCancelReason.MARKET_HALTED,
                    },
                }),
            ),
        ).toMatchObject({ status: "canceled", cancelReason: "market_halted" });
    });
});

describe("OCO and batch cancel schemas", () => {
    const ids = (count: number) =>
        Array.from({ length: count }, (_, index) => formatId(BigInt(index + 1)));

    it("bounds batch cancel to 1 to 50 distinct non-zero trigger IDs", () => {
        const parseBatch = (input: BatchCancelTriggersInput) =>
            v.parse(BatchCancelTriggersInputSchema, input);

        expect(parseBatch({ requestId: "r-1", triggerIds: ids(50) }).triggerIds).toHaveLength(50);
        expect(() => parseBatch({ triggerIds: [] })).toThrow("At least one trigger");
        expect(() => parseBatch({ triggerIds: ids(51) })).toThrow("at most 50");
        expect(() => parseBatch({ triggerIds: [formatId(7n), formatId(7n)] })).toThrow("distinct");
        expect(() => parseBatch({ triggerIds: [formatId(0n)] })).toThrow("greater than zero");
        expect(() => parseBatch({ requestId: "has space", triggerIds: ids(1) })).toThrow();
    });

    it("builds an OCO intent and rejects a take-profit on the losing side of the stop-loss", () => {
        const schema = createCreateOcoInputSchema(testScales());
        const legs = {
            takeProfit: { triggerPrice: "90", execution: { type: "market_ioc" } },
            stopLoss: { triggerPrice: "110", execution: { type: "market_ioc" } },
        } as const;

        const buy = v.parse(schema, {
            symbolId: 1,
            side: "buy",
            qty: "0.5",
            selfTradePreventionMode: "expire_both",
            ...legs,
            stopLoss: { ...legs.stopLoss, triggerPriceSource: "index" },
        });
        expect(buy.oco).toMatchObject({
            side: ProtoOrders.Side.BUY,
            qtyScaled: 50_000_000n,
            selfTradePreventionMode: ProtoOrders.SelfTradePreventionMode.EXPIRE_BOTH,
            stopLoss: { triggerPriceSource: ProtoOrders.TriggerPriceSource.INDEX_PRICE },
        });
        expect(buy.oco.clientListId.length).toBeGreaterThan(0);
        expect(() => v.parse(schema, { symbolId: 1, side: "sell", qty: "0.5", ...legs })).toThrow(
            "takeProfit.triggerPrice must be above stopLoss.triggerPrice",
        );
        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                side: "buy",
                qty: "0.5",
                clientListId: "x".repeat(37),
                ...legs,
            }),
        ).toThrow();
    });

    it("filters listed triggers by OCO", () => {
        expect(
            v.parse(ListTriggersInputSchema, {
                orderListId: formatId(70n),
                clientListId: "x".repeat(36),
            }),
        ).toMatchObject({ orderListId: 70n, clientListId: "x".repeat(36) });
        expect(() => v.parse(ListTriggersInputSchema, { clientListId: "é".repeat(19) })).toThrow();
    });

    it("exposes a leg's OCO IDs and the renamed quote-size failure reason", () => {
        const schema = createTriggerSchema(testScales());

        expect(v.parse(schema, baseWireTrigger())).toMatchObject({
            orderListId: undefined,
            clientListId: "",
        });
        expect(
            v.parse(
                schema,
                baseWireTrigger({
                    orderListId: 70n,
                    clientListId: "my-oco-1",
                    clientTriggerId: "",
                    status: Proto.TriggerStatus.STATUS_FAILED,
                    terminalReason: {
                        case: "failureReason",
                        value: Proto.TriggerFailureReason.QUOTE_SIZE_TOO_SMALL,
                    },
                }),
            ),
        ).toMatchObject({
            orderListId: formatId(70n),
            clientListId: "my-oco-1",
            clientTriggerId: "",
            failureReason: "quote_size_too_small",
        });
    });
});
