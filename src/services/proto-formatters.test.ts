import { create } from "@bufbuild/protobuf";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import * as ProtoLedgerRead from "../gen/ledger/read/v1/ledger_read_pb.js";
import * as ProtoMarketData from "../gen/marketdata/v1/marketdata_pb.js";
import * as ProtoWrite from "../gen/orders/v1/orders_pb.js";
import * as ProtoRead from "../gen/orders/v1/orders_read_pb.js";
import type { EnrichedPairConfig } from "../catalogs/index.js";
import { createCatalogSdkScales } from "../shared/decimal-surface.js";
import { createTestCatalog } from "../testing/catalog.js";
import { createLedgerBalanceSchema, formatLedgerBalance } from "./balances/balances.schemas.js";
import { createCandleRowSchema, formatCandleRow } from "./candles/candles.schemas.js";
import { createMarketTradeSchema, formatMarketTrade } from "./market-data/market-data.schemas.js";
import { createOrderSchema, formatOrder } from "./orders/orders-output.schemas.js";
import { createUserTradeSchema, formatUserTrade } from "./trades/trades.schemas.js";

// The streams skip Valibot for protobuf-decoded messages; these pin the fast path to the
// exact payload the schemas produce, so the two cannot drift apart.

const asset = (symbol: string, ledgerId: number, quantityScale: number) => ({
    symbol,
    ledgerId,
    name: symbol,
    quantityDisplayDecimals: quantityScale,
    quantityScale,
});

const pair: EnrichedPairConfig = {
    symbolId: 1,
    symbol: "BTC-USDT",
    baseAsset: asset("BTC", 1, 8),
    quoteAsset: asset("USDT", 2, 6),
    tickSize: "0.01",
    stepSize: "0.00000001",
    minNotionalQuote: "1",
    minQtyBase: "0.00000001",
    allowBuyFeeFromBase: true,
    defaultMarketSlippagePctBuy: 1,
    defaultMarketSlippagePctSell: 1,
    maxClientRefDriftPct: 5,
    listingAt: null,
    delistingAt: null,
    status: "enabled",
};

const catalog = createTestCatalog({ pairs: [pair] });
const scales = createCatalogSdkScales(() => catalog);

describe("protobuf fast-path formatters", () => {
    it("format orders like the order schema", () => {
        const schema = createOrderSchema(scales);
        const orders = [
            create(ProtoRead.OrderSchema, {
                orderId: 11n,
                symbolId: 1,
                status: ProtoRead.OrderStatus.WORKING,
                origQtyScaled: 100_000_000n,
                leavesQtyScaled: 100_000_000n,
                priceTicks: 100_000_000_000n,
                createdTsNs: 1_000_000n,
                version: 3,
            }),
            create(ProtoRead.OrderSchema, {
                orderId: 12n,
                symbolId: 1,
                clientOrderId: "client-2",
                side: ProtoWrite.Side.SELL,
                status: ProtoRead.OrderStatus.CANCELED,
                orderType: ProtoWrite.OrderType.LIMIT,
                timeInForce: ProtoWrite.TimeInForce.GTC,
                feeAsset: ProtoWrite.FeeAsset.QUOTE,
                origQtyScaled: 125_000_000n,
                cumQtyScaled: 50_000_000n,
                inheritedCumQtyScaled: 10_000_000n,
                leavesQtyScaled: 75_000_000n,
                avgPriceTicks: 100_250_000_000n,
                avgPriceE18: { hi: 0n, lo: 100_250_000_000_000_000_000n & ((1n << 64n) - 1n) },
                cumNotional: { hi: 0n, lo: 5_012_500_000_000n },
                feeTotal: { amountE18: { hi: 0n, lo: 12_345n }, isRebate: true, qtyScaled: 7n },
                priceTicks: 100_000_000_000n,
                createdTsNs: 1_000_000n,
                terminalTsNs: 2_000_000n,
                cancelReason: ProtoRead.CancelReason.STP_EXPIRE_MAKER,
                lineage: { id: 7n, generation: 2 },
                origin: { scope: 1, triggerType: 1, triggerId: 9n, parentOrderId: 8n, childSeq: 1 },
                attachedRisk: {
                    takeProfit: {
                        policy: {
                            triggerPriceTicks: 101_000_000_000n,
                            child: {
                                execution: {
                                    case: "limitGtc",
                                    value: { priceTicks: 102_500_000_000n },
                                },
                            },
                        },
                        state: {
                            status: ProtoRead.AttachedRiskLegState_Status.COMPLETED,
                            armedTsNs: 1_000_000_123n,
                            terminalTsNs: 2_000_000_456n,
                            triggerId: 33n,
                            childOrderId: 44n,
                        },
                    },
                    oco: true,
                },
                marketClientRefPriceTicks: 100_000_000_000n,
                marketMaxSlippageBps: 25,
                version: 4,
                batchRequestId: 5n,
                submittedMaxQuoteDebitScaled: 1_000_000n,
                expireAt: { seconds: 1_700_000_000n, nanos: 500_000_000 },
            }),
        ];
        for (const order of orders) {
            expect(formatOrder(scales, order)).toStrictEqual(v.parse(schema, order));
        }
    });

    it("format user trades like the user trade schema", () => {
        const schema = createUserTradeSchema(scales);
        for (const trade of [
            create(ProtoRead.UserTradeSchema, {
                orderId: 1n,
                symbolId: 1,
                qtyScaled: 5n,
                priceTicks: 7n,
                tsNs: 1n,
            }),
            create(ProtoRead.UserTradeSchema, {
                orderId: 2n,
                symbolId: 1,
                side: ProtoWrite.Side.SELL,
                isMaker: true,
                feeAsset: ProtoWrite.FeeAsset.BASE,
                qtyScaled: 123_456_789n,
                priceTicks: 100_000_000_000n,
                feeAmountE18: { hi: 0n, lo: 1_000n },
                referralShareAmountE18: { hi: 1n, lo: 2n },
                feeIsRebate: true,
                tsNs: 1_700_000_000_000_000_000n,
                matchId: 22n,
                lineage: { id: 7n, generation: 3 },
            }),
        ]) {
            expect(formatUserTrade(scales, trade)).toStrictEqual(v.parse(schema, trade));
        }
    });

    it("format market trades like the market trade schema", () => {
        const trade = create(ProtoMarketData.MarketTradeSchema, {
            symbolId: 1,
            matchId: 22n,
            isBuy: true,
            priceTicks: 1_234_567_000n,
            qtyScaled: 123_456_789n,
            tsNs: 1_700_000_000_000_000_000n,
        });
        expect(formatMarketTrade(scales, trade)).toStrictEqual(
            v.parse(createMarketTradeSchema(scales), trade),
        );
    });

    it("format balances like the ledger balance schema", () => {
        const schema = createLedgerBalanceSchema();
        for (const balance of [
            create(ProtoLedgerRead.AssetBalanceSchema, { assetId: 1 }),
            create(ProtoLedgerRead.AssetBalanceSchema, {
                assetId: 2,
                trading: { hi: 1n, lo: 5n },
                funding: { hi: 0n, lo: 1_500_000_000_000_000_000n },
                reserved: { hi: 0n, lo: 1n },
                available: { hi: 0n, lo: 2n },
                tradingRevision: 9n,
                fundingRevision: 10n,
            }),
        ]) {
            expect(formatLedgerBalance(balance)).toStrictEqual(v.parse(schema, balance));
        }
    });

    it("format candles like the candle row schema", () => {
        const point = create(ProtoMarketData.CandlePointSchema, {
            tsSec: 100n,
            open: 1_234_000_000n,
            high: 1_235_000_000n,
            low: 1_233_000_000n,
            close: 1_234_567_000n,
            volume: 123_456_789n,
            quoteVolume: "152415.677625363",
            isClosed: true,
        });
        const timeframe = ProtoMarketData.Timeframe.SEC_1;
        expect(formatCandleRow(scales, point, 1, timeframe)).toStrictEqual(
            v.parse(createCandleRowSchema(scales), { ...point, symbolId: 1, timeframe }),
        );
    });
});
