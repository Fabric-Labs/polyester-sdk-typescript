import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/pnl/v1/pnl_pb.js";
import { subaccountResolverStub, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { ProfitAndLossService } from "./profit-and-loss.js";

const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

function serviceWith(response: Record<string, unknown>, resolverDefault: string | null = null) {
    const transport = unaryTransport(response);
    const service = new ProfitAndLossService(
        { authApi: transport.transport },
        subaccountResolverStub(resolverDefault),
    );
    return { transport, service };
}

describe("ProfitAndLossService", () => {
    it("gets PnL for the resolved account and nulls omitted figures", async () => {
        const { transport, service } = serviceWith(
            create(Proto.GetProfitAndLossResponseSchema, {
                windowStart: ts(1_700_000_000),
                asOf: ts(1_700_000_100),
                markTime: ts(1_700_000_060),
                realizedPnlUsd: "-1.5",
                feesUsd: "0.25",
                volumeUsd: "100",
                products: [
                    {
                        product: Proto.ProfitAndLossProduct.SPOT,
                        realizedPnlUsd: "-1.5",
                        feesUsd: "0.25",
                        volumeUsd: "100",
                    },
                ],
                markets: [
                    {
                        symbolId: 3,
                        product: Proto.ProfitAndLossProduct.SPOT,
                        realizedPnlUsd: "-1.5",
                        feesUsd: "0.25",
                        volumeUsd: "100",
                        tradeCount: 2n,
                    },
                ],
                holdings: [
                    {
                        assetId: 5,
                        positionQuantity: "2",
                        untrackedQuantity: "1",
                        costUsd: "50",
                        entryPriceUsd: "50",
                    },
                ],
                notices: [Proto.ProfitAndLossNotice.MARK_UNAVAILABLE],
            }),
            formatId(42n),
        );

        await expect(
            service.get({ window: "days_7", product: "spot", symbolId: 3 }),
        ).resolves.toEqual({
            windowStart: 1_700_000_000_000,
            asOf: 1_700_000_100_000,
            markTime: 1_700_000_060_000,
            pnlUsd: null,
            realizedPnlUsd: "-1.5",
            unrealizedPnlChangeUsd: null,
            unrealizedPnlUsd: null,
            feesUsd: "0.25",
            volumeUsd: "100",
            products: [
                { product: "spot", realizedPnlUsd: "-1.5", feesUsd: "0.25", volumeUsd: "100" },
            ],
            markets: [
                {
                    symbolId: 3,
                    product: "spot",
                    realizedPnlUsd: "-1.5",
                    feesUsd: "0.25",
                    volumeUsd: "100",
                    tradeCount: "2",
                },
            ],
            holdings: [
                {
                    assetId: 5,
                    positionQuantity: "2",
                    untrackedQuantity: "1",
                    costUsd: "50",
                    entryPriceUsd: "50",
                    markPriceUsd: null,
                    unrealizedPnlUsd: null,
                },
            ],
            notices: ["mark_unavailable"],
        });

        const call = transport.lastCall();
        expect(call?.method.name).toBe("GetProfitAndLoss");
        expect(call?.message).toEqual({
            subaccountId: 42n,
            window: Proto.ProfitAndLossWindow.DAYS_7,
            product: Proto.ProfitAndLossProduct.SPOT,
            symbolId: 3,
        });
    });

    it("lists daily PnL with millisecond bounds sent as timestamps", async () => {
        const { transport, service } = serviceWith(
            create(Proto.ListDailyProfitAndLossResponseSchema, {
                days: [
                    {
                        day: ts(1_763_596_800),
                        pnlUsd: "4",
                        realizedPnlUsd: "3",
                        unrealizedPnlAtCloseUsd: "1",
                        feesUsd: "0.1",
                        volumeUsd: "40",
                        tradeCount: 7n,
                        startEquityUsd: "1000",
                        endEquityUsd: "1004",
                        netFlowUsd: "0",
                    },
                ],
                nextPageToken: "next",
                asOf: ts(1_763_683_200),
            }),
        );

        await expect(
            service.listDaily({
                account: "main",
                startTime: 1_763_596_800_000,
                endTime: 1_763_683_200_000,
                limit: 10,
            }),
        ).resolves.toEqual({
            days: [
                {
                    day: 1_763_596_800_000,
                    pnlUsd: "4",
                    realizedPnlUsd: "3",
                    unrealizedPnlAtCloseUsd: "1",
                    feesUsd: "0.1",
                    volumeUsd: "40",
                    tradeCount: "7",
                    notices: [],
                    startEquityUsd: "1000",
                    endEquityUsd: "1004",
                    netFlowUsd: "0",
                },
            ],
            nextPageToken: "next",
            asOf: 1_763_683_200_000,
        });

        const call = transport.lastCall();
        expect(call?.method.name).toBe("ListDailyProfitAndLoss");
        expect(call?.message).toEqual({
            startTime: { seconds: 1_763_596_800n, nanos: 0 },
            endTime: { seconds: 1_763_683_200n, nanos: 0 },
            limit: 10,
        });
    });

    it("gets trading statistics for an explicit subaccount", async () => {
        const { transport, service } = serviceWith(
            create(Proto.GetTradingStatisticsResponseSchema, {
                windowStart: ts(1_700_000_000),
                asOf: ts(1_700_000_100),
                tradeCount: 12n,
                volumeUsd: "500",
                feesUsd: "1",
                realizedPnlUsd: "9",
                notices: [Proto.ProfitAndLossNotice.SHARPE_INSUFFICIENT_DAYS],
                returnPct: "9.95",
                maxDrawdownPct: "0",
                returnDays: 2,
            }),
        );

        await expect(
            service.getTradingStatistics({
                account: { subaccountId: formatId(7n) },
                window: "days_30",
            }),
        ).resolves.toEqual({
            windowStart: 1_700_000_000_000,
            asOf: 1_700_000_100_000,
            tradeCount: "12",
            volumeUsd: "500",
            feesUsd: "1",
            realizedPnlUsd: "9",
            notices: ["sharpe_insufficient_days"],
            returnPct: "9.95",
            maxDrawdownPct: "0",
            sharpe: null,
            returnDays: 2,
        });

        const call = transport.lastCall();
        expect(call?.method.name).toBe("GetTradingStatistics");
        expect(call?.message).toEqual({
            subaccountId: 7n,
            window: Proto.ProfitAndLossWindow.DAYS_30,
        });
    });
});
