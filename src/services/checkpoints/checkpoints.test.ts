import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/checkpoints/v1/checkpoints_pb.js";
import { Side } from "../../gen/orders/v1/orders_pb.js";
import { ValidationError } from "../../shared/errors.js";
import { unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { CheckpointsService } from "./checkpoints.js";

type CheckpointInit = Exclude<MessageInitShape<typeof Proto.CheckpointSchema>, Proto.Checkpoint>;

const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

function checkpoint(overrides: CheckpointInit = {}) {
    return create(Proto.CheckpointSchema, {
        number: 1,
        seasonStart: ts(1_700_000_000),
        seasonEnd: ts(1_700_086_400),
        takenAt: ts(1_700_090_000),
        volumeUsd: "1250.5",
        trades: 3n,
        tradesByWeekdayHour: Array.from({ length: 7 }, () => ({
            hours: Array.from({ length: 24 }, () => 0n),
        })),
        biggestTradeUsd: "900",
        fillRate: "0.5",
        cancelRatio: "0",
        ...overrides,
    });
}

function serviceReturning(...checkpoints: Proto.Checkpoint[]) {
    const authApi = unaryTransport({ checkpoints });
    return { authApi, service: new CheckpointsService({ authApi: authApi.transport }) };
}

describe("CheckpointsService", () => {
    it("lists checkpoints through the authenticated transport", async () => {
        const { authApi, service } = serviceReturning(
            checkpoint({
                biggestTrade: {
                    symbolId: 1,
                    symbol: "BTC-USDT",
                    side: Side.SELL,
                    at: ts(1_700_000_100),
                },
                medianLimitRestMs: 1_500n,
                busiestDay: "2023-11-14",
                mostActiveHourUtc: 23,
                vipTierAtCheckpoint: 2,
                peakVipTier: 10,
                badges: [{ badge: Proto.CheckpointBadge.FIRST_TRADE, earnedAt: ts(1_700_000_100) }],
                tradingBalances: [{ asset: "USDT", amount: "10" }],
                netInflowUsd: "-12.5",
                incomplete: [Proto.CheckpointField.PORTFOLIO_VALUE, 99 as Proto.CheckpointField],
            }),
        );
        const signal = new AbortController().signal;

        const [first] = await service.list({}, { signal });

        expect(first).toMatchObject({
            number: 1,
            seasonStart: 1_700_000_000_000,
            volumeUsd: "1250.5",
            trades: 3,
            biggestTrade: { symbol: "BTC-USDT", side: "sell", at: 1_700_000_100_000 },
            medianLimitRestMs: 1500,
            mostActiveHourUtc: 23,
            badges: [{ badge: "first_trade", earnedAt: 1_700_000_100_000 }],
            tradingBalances: [{ asset: "USDT", amount: "10" }],
            netInflowUsd: "-12.5",
            incomplete: ["portfolio_value", "unspecified"],
            orderTypes: { limit: 0, market: 0 },
            transfersIn: { count: 0 },
        });
        expect(first?.tradesByWeekdayHour).toHaveLength(7);
        expect(first?.tradesByWeekdayHour[0]).toHaveLength(24);
        expect(authApi.lastCall()?.method.localName).toBe("listMyCheckpoints");
        expect(authApi.lastCall()?.message).toEqual({});
        expect(authApi.lastCall()?.signal).toBe(signal);
    });

    it("sends the subaccount and returns an empty list", async () => {
        const { authApi, service } = serviceReturning();

        await expect(service.list({ subaccountId: formatId(7n) })).resolves.toEqual([]);
        expect(authApi.lastCall()?.message).toEqual({ subaccountId: 7n });
    });

    it("rejects a subaccount id of zero before calling the server", async () => {
        const { authApi, service } = serviceReturning();

        // "1" is the base58 encoding of 0n.
        await expect(service.list({ subaccountId: "1" })).rejects.toThrow(ValidationError);
        expect(authApi.calls).toEqual([]);
    });

    it.each([
        ["checkpoint number zero", { number: 0 }],
        ["VIP tier above 10", { peakVipTier: 11 }],
        ["hour above 23", { mostActiveHourUtc: 24 }],
        ["fill rate above 1", { fillRate: "1.01" }],
        ["negative volume", { volumeUsd: "-1" }],
        ["non-decimal USD value", { inflowUsd: "1e3" }],
        ["malformed busiest day", { busiestDay: "2023-13-01" }],
        [
            "six weekday rows",
            {
                tradesByWeekdayHour: Array.from({ length: 6 }, () => ({
                    hours: Array.from({ length: 24 }, () => 0n),
                })),
            },
        ],
        [
            "23 hourly counts",
            {
                tradesByWeekdayHour: Array.from({ length: 7 }, () => ({
                    hours: Array.from({ length: 23 }, () => 0n),
                })),
            },
        ],
        ["count past the safe integer range", { trades: BigInt(Number.MAX_SAFE_INTEGER) + 1n }],
    ] satisfies [string, CheckpointInit][])("rejects a %s", async (_name, overrides) => {
        const { service } = serviceReturning(checkpoint(overrides));

        await expect(service.list()).rejects.toThrow(ValidationError);
    });
});
