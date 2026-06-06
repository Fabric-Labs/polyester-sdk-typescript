import { z } from "zod";
import { fromU128, u128ToDecimal } from "../../utils/u128";
import { assetForId, LEDGER_SCALE } from "../../../../catalogs/ledger-catalog";
import { idToBigInt } from "../../utils/base58-id";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb";
import { BalanceRangeCodec, EquityGroupByCodec } from "./balances.codecs";

const U128Schema = z.object({
    hi: z.bigint(),
    lo: z.bigint(),
});

export const LedgerBalanceSchema = z
    .object({
        assetId: z.number(),
        trading: U128Schema.optional(),
        unified: U128Schema.optional(),
        funding: U128Schema.optional().transform(fromU128),
        reserved: U128Schema.optional().transform(fromU128),
        available: U128Schema.optional().transform(fromU128),
    })
    .transform((b) => {
        const aid = b.assetId;
        const unified = fromU128(b.trading ?? b.unified);

        return {
            asset: assetForId(aid),
            funding: parseFloat(u128ToDecimal(b.funding, LEDGER_SCALE)),
            unified: parseFloat(u128ToDecimal(unified, LEDGER_SCALE)),
            reserved: parseFloat(u128ToDecimal(b.reserved, LEDGER_SCALE)),
            available: parseFloat(u128ToDecimal(b.available, LEDGER_SCALE)),
        };
    });

export type LedgerBalance = z.output<typeof LedgerBalanceSchema>;

export const BALANCE_RANGES = ["1d", "7d", "30d", "90d", "180d", "365d"] as const;

export const BalanceRangeSchema = z.enum(BALANCE_RANGES);

export type BalanceRange = z.output<typeof BalanceRangeSchema>;

export const EQUITY_GROUP_BYS = ["account", "asset"] as const;

export const EquityGroupBySchema = z.enum(EQUITY_GROUP_BYS);

export type EquityGroupBy = z.output<typeof EquityGroupBySchema>;

export const BalanceHistoryInputSchema = z
    .object({
        subAccountId: z
            .string()
            .optional()
            .transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
        range: BalanceRangeSchema.transform((v) => BalanceRangeCodec.inputToProto[v]),
        ledger: z.number().optional().default(0),
        accountCodes: z.array(z.number()).optional().default([]),
    })
    .transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    }));

export type BalanceHistoryInput = z.input<typeof BalanceHistoryInputSchema>;

export const BalanceSeriesSchema = z.object({
    assetId: z.number(),
    accountCode: z.number(),
    balanceQ: z.array(z.bigint()),
});

export const BalanceHistoryResponseSchema = z
    .object({
        range: z
            .enum(Proto.BalanceRange)
            .transform((v) => BalanceRangeCodec.protoToOutputWithDefault[v]),
        bucket: z.string(),
        startTsSec: z.number(),
        endTsSec: z.number(),
        points: z.number(),
        series: z.array(BalanceSeriesSchema),
    })
    .transform((data) => ({
        range: data.range,
        bucket: data.bucket,
        startTsSec: data.startTsSec,
        endTsSec: data.endTsSec,
        points: data.points,
        series: data.series.map((s) => ({
            asset: assetForId(s.assetId),
            accountCode: s.accountCode,
            // balanceQ is scaled by 1e7, convert to float array
            balances: s.balanceQ.map((b) => Number(b) / 1e7),
        })),
    }));

export type BalanceHistoryResponse = z.output<typeof BalanceHistoryResponseSchema>;

export const EquityHistoryInputSchema = z
    .object({
        subAccountId: z
            .string()
            .optional()
            .transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
        range: BalanceRangeSchema.transform((v) => BalanceRangeCodec.inputToProto[v]),
        accountCodes: z.array(z.number()).optional().default([]),
        groupBy: EquityGroupBySchema.optional()
            .default("account")
            .transform((v) => EquityGroupByCodec.inputToProto[v]),
    })
    .transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    }));

export type EquityHistoryInput = z.input<typeof EquityHistoryInputSchema>;

const EquitySeriesGroupingSchema = z.union([
    z.object({
        case: z.literal("account"),
        value: z.object({
            code: z.number(),
            name: z.string(),
        }),
    }),
    z.object({
        case: z.literal("asset"),
        value: z.object({
            id: z.number(),
            symbol: z.string(),
        }),
    }),
]);

export type EquitySeriesGrouping =
    | {
          type: "account";
          accountCode: number;
          name: string;
      }
    | {
          type: "asset";
          assetId: number;
          symbol: string;
      };

export const EquitySeriesSchema = z
    .object({
        grouping: EquitySeriesGroupingSchema,
        equityQ: z.array(z.bigint()),
    })
    .transform((series): { grouping: EquitySeriesGrouping; equityQ: bigint[] } => {
        if (series.grouping.case === "account") {
            return {
                grouping: {
                    type: "account",
                    accountCode: series.grouping.value.code,
                    name: series.grouping.value.name,
                },
                equityQ: series.equityQ,
            };
        }

        return {
            grouping: {
                type: "asset",
                assetId: series.grouping.value.id,
                symbol: series.grouping.value.symbol,
            },
            equityQ: series.equityQ,
        };
    });

export const EquityHistoryResponseSchema = z
    .object({
        range: z
            .enum(Proto.BalanceRange)
            .transform((v) => BalanceRangeCodec.protoToOutputWithDefault[v]),
        bucket: z.string(),
        startTsSec: z.number(),
        endTsSec: z.number(),
        quoteAsset: z.string(),
        points: z.number(),
        series: z.array(EquitySeriesSchema),
        btcPricesQ: z.array(z.bigint()).optional().default([]),
    })
    .transform((data) => ({
        range: data.range,
        bucket: data.bucket,
        startTsSec: data.startTsSec,
        endTsSec: data.endTsSec,
        quoteAsset: data.quoteAsset,
        points: data.points,
        series: data.series,
        btcPricesQ: data.btcPricesQ,
    }));

export type EquitySeries = z.output<typeof EquitySeriesSchema>;
export type EquityHistoryResponse = z.output<typeof EquityHistoryResponseSchema>;
