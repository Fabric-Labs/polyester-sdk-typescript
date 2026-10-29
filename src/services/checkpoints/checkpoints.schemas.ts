import * as v from "valibot";
import { enumLabel, enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    OptionalTimestampMsSchema,
    optionalSubaccountIdInputSchema,
    TimestampMsSchema,
} from "../../shared/schemas.js";
import { OrderSideCodec } from "../orders/order-enums.codecs.js";
import { CheckpointBadgeCodec, CheckpointFieldCodec } from "./checkpoints.codecs.js";

// Money values and ratios stay base-10 decimal strings so consumers parse them
// with a decimal type; the contract marks which ones may be negative.
const UnsignedDecimalSchema = v.pipe(v.string(), v.regex(/^\d+(\.\d+)?$/));
const SignedDecimalSchema = v.pipe(v.string(), v.regex(/^-?\d+(\.\d+)?$/));
const RatioSchema = v.pipe(v.string(), v.regex(/^(0(\.\d+)?|1(\.0+)?)$/));
const UtcDateSchema = v.pipe(v.string(), v.isoDate());

// uint64 counts surface as numbers; a count past 2^53 would lose precision, so it fails instead.
const CountSchema = v.pipe(
    v.bigint(),
    v.maxValue(BigInt(Number.MAX_SAFE_INTEGER)),
    v.transform(Number),
);

const VipTierSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10));
const UtcHourSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(23));

export const CheckpointVolumePointSchema = v.object({
    day: TimestampMsSchema,
    usd: UnsignedDecimalSchema,
    approximate: v.boolean(),
    trades: CountSchema,
});

export type CheckpointVolumePoint = v.InferOutput<typeof CheckpointVolumePointSchema>;

export const CheckpointPortfolioValuePointSchema = v.object({
    hour: TimestampMsSchema,
    usd: SignedDecimalSchema,
    approximate: v.boolean(),
});

export type CheckpointPortfolioValuePoint = v.InferOutput<
    typeof CheckpointPortfolioValuePointSchema
>;

// Monday first; each row holds UTC hours 0 through 23.
const TradesByWeekdayHourSchema = v.pipe(
    v.array(
        v.pipe(
            v.object({ hours: v.pipe(v.array(CountSchema), v.length(24)) }),
            v.transform(({ hours }) => hours),
        ),
    ),
    v.length(7),
);

export const CheckpointPairActivitySchema = v.object({
    symbolId: v.number(),
    symbol: v.string(),
    volumeUsd: UnsignedDecimalSchema,
    trades: CountSchema,
});

export type CheckpointPairActivity = v.InferOutput<typeof CheckpointPairActivitySchema>;

export const CheckpointBiggestTradeSchema = v.pipe(
    v.object({
        symbolId: v.number(),
        symbol: v.string(),
        side: v.number(),
        at: TimestampMsSchema,
    }),
    v.transform(({ side, ...trade }) => ({
        ...trade,
        side: enumLabel(OrderSideCodec.protoToOutput, side),
    })),
);

export type CheckpointBiggestTrade = v.InferOutput<typeof CheckpointBiggestTradeSchema>;

export const CheckpointOrderTypeCountsSchema = v.object({
    limit: CountSchema,
    market: CountSchema,
});

export type CheckpointOrderTypeCounts = v.InferOutput<typeof CheckpointOrderTypeCountsSchema>;

export const CheckpointTimeInForceCountsSchema = v.object({
    gtc: CountSchema,
    ioc: CountSchema,
    fok: CountSchema,
    gtd: CountSchema,
});

export type CheckpointTimeInForceCounts = v.InferOutput<typeof CheckpointTimeInForceCountsSchema>;

export const CheckpointOrderToolCountsSchema = v.object({
    stopLoss: CountSchema,
    takeProfit: CountSchema,
    trailingStop: CountSchema,
    twap: CountSchema,
    ladder: CountSchema,
});

export type CheckpointOrderToolCounts = v.InferOutput<typeof CheckpointOrderToolCountsSchema>;

export const CheckpointVipTierChangeSchema = v.object({
    date: UtcDateSchema,
    tier: VipTierSchema,
});

export type CheckpointVipTierChange = v.InferOutput<typeof CheckpointVipTierChangeSchema>;

export const CheckpointEarnedBadgeSchema = v.object({
    badge: enumLabelSchema(CheckpointBadgeCodec.protoToOutput),
    earnedAt: TimestampMsSchema,
});

export type CheckpointEarnedBadge = v.InferOutput<typeof CheckpointEarnedBadgeSchema>;

/** `usd` is `undefined` when the asset had no USD price at the required time; it is not zero. */
export const CheckpointAssetAmountSchema = v.object({
    asset: v.string(),
    amount: SignedDecimalSchema,
    usd: v.optional(SignedDecimalSchema),
});

export type CheckpointAssetAmount = v.InferOutput<typeof CheckpointAssetAmountSchema>;

/** `usd` is `undefined` when any operation had no USD value; it is not zero. */
export const CheckpointFlowTotalSchema = v.object({
    count: CountSchema,
    usd: v.optional(UnsignedDecimalSchema),
});

export type CheckpointFlowTotal = v.InferOutput<typeof CheckpointFlowTotalSchema>;

const EmptyFlowTotal = { count: 0n };

export const CheckpointChainFlowSchema = v.object({
    polyesterChainId: v.number(),
    chainName: v.string(),
    total: v.optional(CheckpointFlowTotalSchema, EmptyFlowTotal),
});

export type CheckpointChainFlow = v.InferOutput<typeof CheckpointChainFlowSchema>;

export const CheckpointFundingFlowSummarySchema = v.object({
    count: CountSchema,
    chains: v.optional(v.array(CheckpointChainFlowSchema), []),
    amounts: v.optional(v.array(CheckpointAssetAmountSchema), []),
});

export type CheckpointFundingFlowSummary = v.InferOutput<typeof CheckpointFundingFlowSummarySchema>;

const EmptyFundingFlowSummary = { count: 0n };

export const CheckpointFundingDaySchema = v.object({
    date: UtcDateSchema,
    depositUsd: v.optional(UnsignedDecimalSchema),
    withdrawalUsd: v.optional(UnsignedDecimalSchema),
});

export type CheckpointFundingDay = v.InferOutput<typeof CheckpointFundingDaySchema>;

export const CheckpointSchema = v.object({
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
    seasonStart: TimestampMsSchema,
    seasonEnd: TimestampMsSchema,
    takenAt: TimestampMsSchema,
    volumeUsd: UnsignedDecimalSchema,
    trades: CountSchema,
    orders: CountSchema,
    daysActive: v.number(),
    longestStreak: v.number(),
    topPairs: v.optional(v.array(CheckpointPairActivitySchema), []),
    marketsTraded: v.number(),
    makerTrades: CountSchema,
    takerTrades: CountSchema,
    selfTrades: CountSchema,
    tradesByWeekdayHour: TradesByWeekdayHourSchema,
    dailyVolume: v.optional(v.array(CheckpointVolumePointSchema), []),
    biggestTradeUsd: UnsignedDecimalSchema,
    biggestTrade: v.optional(CheckpointBiggestTradeSchema),
    orderTypes: v.optional(CheckpointOrderTypeCountsSchema, { limit: 0n, market: 0n }),
    timeInForce: v.optional(CheckpointTimeInForceCountsSchema, {
        gtc: 0n,
        ioc: 0n,
        fok: 0n,
        gtd: 0n,
    }),
    tools: v.optional(CheckpointOrderToolCountsSchema, {
        stopLoss: 0n,
        takeProfit: 0n,
        trailingStop: 0n,
        twap: 0n,
        ladder: 0n,
    }),
    postOnly: CountSchema,
    amends: CountSchema,
    filledOrders: CountSchema,
    partiallyFilledOrders: CountSchema,
    canceledOrders: CountSchema,
    rejectedOrders: CountSchema,
    fillRate: RatioSchema,
    cancelRatio: RatioSchema,
    medianLimitRestMs: v.optional(CountSchema),
    firstTradeAt: OptionalTimestampMsSchema,
    busiestDay: v.optional(UtcDateSchema),
    mostActiveHourUtc: v.optional(UtcHourSchema),
    vipTierAtCheckpoint: VipTierSchema,
    peakVipTier: VipTierSchema,
    vipTimeline: v.optional(v.array(CheckpointVipTierChangeSchema), []),
    badges: v.optional(v.array(CheckpointEarnedBadgeSchema), []),
    portfolioValue: v.optional(v.array(CheckpointPortfolioValuePointSchema), []),
    tradingBalances: v.optional(v.array(CheckpointAssetAmountSchema), []),
    fundingBalances: v.optional(v.array(CheckpointAssetAmountSchema), []),
    deposits: v.optional(CheckpointFundingFlowSummarySchema, EmptyFundingFlowSummary),
    withdrawals: v.optional(CheckpointFundingFlowSummarySchema, EmptyFundingFlowSummary),
    fundingByDay: v.optional(v.array(CheckpointFundingDaySchema), []),
    transfersIn: v.optional(CheckpointFlowTotalSchema, EmptyFlowTotal),
    transfersOut: v.optional(CheckpointFlowTotalSchema, EmptyFlowTotal),
    internalTransfers: CountSchema,
    dailyClaims: CountSchema,
    dailyClaimAmounts: v.optional(v.array(CheckpointAssetAmountSchema), []),
    inflowUsd: v.optional(UnsignedDecimalSchema),
    outflowUsd: v.optional(UnsignedDecimalSchema),
    netInflowUsd: v.optional(SignedDecimalSchema),
    finalValueUsd: v.optional(SignedDecimalSchema),
    seasonResultUsd: v.optional(SignedDecimalSchema),
    subaccounts: CountSchema,
    /** Values computed from partial evidence; show them with an approximation marker. */
    incomplete: v.optional(v.array(enumLabelSchema(CheckpointFieldCodec.protoToOutput)), []),
});

/**
 * One frozen season recap of a root account and all of its subaccounts. An absent USD value
 * means the value was unavailable, not zero.
 */
export type Checkpoint = v.InferOutput<typeof CheckpointSchema>;

export const ListCheckpointsResultSchema = v.object({
    checkpoints: v.optional(v.array(CheckpointSchema), []),
});

// A present `subaccountId` of zero names no subaccount, so it fails here instead of reaching the server.
export const ListCheckpointsInputSchema = v.strictObject({
    subaccountId: v.pipe(
        optionalSubaccountIdInputSchema(),
        v.check((value) => value !== 0n, "subaccountId: must be greater than zero"),
    ),
});

export type ListCheckpointsInput = v.InferInput<typeof ListCheckpointsInputSchema>;
