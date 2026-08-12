import * as v from "valibot";
import { fromU128 } from "../../utils/u128.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import type { DecodedEnum } from "../../utils/types.js";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import {
    AccountCodeCodec,
    ACCOUNT_CODE_VALUES,
    type AccountCodeValue,
} from "../../shared/ledger-codes.js";
import { E18_SCALE, scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { BalanceRangeCodec, EquityGroupByCodec } from "./balances.codecs.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";

/**
 * Equity history values are quoted in the response's quote currency at a fixed
 * 4-decimal wire scale (proto: "Equity in quote currency scaled by 1e4").
 */
const EQUITY_SCALE = 4;

/**
 * Balance history buckets use a fixed 7-decimal scale (proto: "balance in
 * asset units scaled by 1e7"), unlike live ledger balances which use E18.
 */
const BALANCE_HISTORY_SCALE = 7;

const U128Schema = v.object({
    hi: v.bigint(),
    lo: v.bigint(),
});

/**
 * AssetBalance u128 fields on the ledger wire are always 18-decimal scaled
 * (PolyesterChain base units), independent of per-asset quantityScale used
 * elsewhere for order quantities and transfer inputs.
 */
export function createLedgerBalanceSchema() {
    return v.pipe(
        v.object({
            assetId: v.number(),
            trading: v.pipe(v.optional(U128Schema), v.transform(fromU128)),
            funding: v.pipe(v.optional(U128Schema), v.transform(fromU128)),
            reserved: v.pipe(v.optional(U128Schema), v.transform(fromU128)),
            available: v.pipe(v.optional(U128Schema), v.transform(fromU128)),
            tradingRevision: v.pipe(
                v.optional(v.bigint(), 0n),
                v.transform((value) => value.toString()),
            ),
            fundingRevision: v.pipe(
                v.optional(v.bigint(), 0n),
                v.transform((value) => value.toString()),
            ),
        }),
        v.transform((b) => {
            return {
                assetId: b.assetId,
                funding: scaledToDecimalOutput(b.funding ?? 0n, E18_SCALE),
                trading: scaledToDecimalOutput(b.trading ?? 0n, E18_SCALE),
                reserved: scaledToDecimalOutput(b.reserved ?? 0n, E18_SCALE),
                available: scaledToDecimalOutput(b.available ?? 0n, E18_SCALE),
                tradingRevision: b.tradingRevision,
                fundingRevision: b.fundingRevision,
            };
        }),
    );
}

export type LedgerBalance = v.InferOutput<ReturnType<typeof createLedgerBalanceSchema>>;

export const BalancesListInputSchema = v.strictObject(AccountScopeInputEntries);

export type BalancesListInput = v.InferInput<typeof BalancesListInputSchema>;

export const BALANCE_RANGES = ["1d", "7d", "30d", "90d", "180d", "365d"] as const;

export const BalanceRangeSchema = v.picklist(BALANCE_RANGES);

export type BalanceRange = v.InferOutput<typeof BalanceRangeSchema>;

export const EQUITY_GROUP_BYS = ["account", "asset"] as const;

export const EquityGroupBySchema = v.picklist(EQUITY_GROUP_BYS);

export type EquityGroupBy = v.InferOutput<typeof EquityGroupBySchema>;

export const BalanceHistoryInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        range: v.pipe(
            BalanceRangeSchema,
            v.transform((v) => BalanceRangeCodec.inputToProto[v]),
        ),
        ledger: v.optional(
            v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(4_294_967_295)),
            0,
        ),
        accountCodes: v.optional(
            v.array(
                v.pipe(
                    v.picklist(ACCOUNT_CODE_VALUES),
                    v.transform((value) => AccountCodeCodec.inputToProto[value]),
                ),
            ),
            [],
        ),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type BalanceHistoryInput = v.InferInput<typeof BalanceHistoryInputSchema>;

const BalanceSeriesSchema = v.object({
    assetId: v.number(),
    accountCode: v.enum(AccountCodeCodec.inputToProto),
    balanceQ: v.array(v.bigint()),
});

export function createBalanceHistoryResponseSchema() {
    return v.pipe(
        v.object({
            range: v.pipe(
                v.enum(Proto.BalanceRange),
                v.transform((v) =>
                    requiredEnumLabel(
                        BalanceRangeCodec.protoToOutput,
                        v,
                        "BalanceHistoryResponseSchema",
                        "range",
                    ),
                ),
            ),
            bucket: v.string(),
            startTsSec: v.number(),
            endTsSec: v.number(),
            points: v.number(),
            series: v.array(BalanceSeriesSchema),
        }),
        v.transform((data) => ({
            range: data.range,
            bucket: data.bucket,
            startTsSec: data.startTsSec,
            endTsSec: data.endTsSec,
            points: data.points,
            series: data.series.map((s) => {
                return {
                    assetId: s.assetId,
                    accountCode: requiredEnumLabel(
                        AccountCodeCodec.protoToOutput,
                        s.accountCode,
                        "BalanceHistoryResponseSchema",
                        "account code",
                    ),
                    balance: s.balanceQ.map((b) => scaledToDecimalOutput(b, BALANCE_HISTORY_SCALE)),
                };
            }),
        })),
    );
}

export type BalanceHistoryResponse = v.InferOutput<
    ReturnType<typeof createBalanceHistoryResponseSchema>
>;

export const EquityHistoryInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        range: v.pipe(
            BalanceRangeSchema,
            v.transform((v) => BalanceRangeCodec.inputToProto[v]),
        ),
        accountCodes: v.optional(
            v.array(
                v.pipe(
                    v.picklist(ACCOUNT_CODE_VALUES),
                    v.transform((value) => AccountCodeCodec.inputToProto[value]),
                ),
            ),
            [],
        ),
        groupBy: v.pipe(
            v.optional(EquityGroupBySchema, "account"),
            v.transform((v) => EquityGroupByCodec.inputToProto[v ?? "account"]),
        ),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type EquityHistoryInput = v.InferInput<typeof EquityHistoryInputSchema>;

const EquitySeriesGroupingSchema = v.union([
    v.object({
        case: v.literal("account"),
        value: v.object({
            accountCode: v.enum(AccountCodeCodec.inputToProto),
            name: v.string(),
        }),
    }),
    v.object({
        case: v.literal("asset"),
        value: v.object({
            id: v.number(),
            symbol: v.string(),
        }),
    }),
]);

export type EquitySeriesGrouping =
    | {
          type: "account";
          accountCode: DecodedEnum<AccountCodeValue>;
          name: string;
      }
    | {
          type: "asset";
          assetId: number;
          symbol: string;
      };

export const EquitySeriesSchema = v.pipe(
    v.object({
        grouping: EquitySeriesGroupingSchema,
        equityQ: v.array(v.bigint()),
    }),
    v.transform((series): { grouping: EquitySeriesGrouping; equity: string[] } => {
        const equity = series.equityQ.map((value) => scaledToDecimalOutput(value, EQUITY_SCALE));
        if (series.grouping.case === "account") {
            return {
                grouping: {
                    type: "account",
                    accountCode: requiredEnumLabel(
                        AccountCodeCodec.protoToOutput,
                        series.grouping.value.accountCode,
                        "EquitySeriesSchema",
                        "account code",
                    ),
                    name: series.grouping.value.name,
                },
                equity,
            };
        }

        return {
            grouping: {
                type: "asset",
                assetId: series.grouping.value.id,
                symbol: series.grouping.value.symbol,
            },
            equity,
        };
    }),
);

export function createEquityHistoryResponseSchema(scales: SdkScales) {
    return v.pipe(
        v.object({
            range: v.pipe(
                v.enum(Proto.BalanceRange),
                v.transform((v) =>
                    requiredEnumLabel(
                        BalanceRangeCodec.protoToOutput,
                        v,
                        "EquityHistoryResponseSchema",
                        "range",
                    ),
                ),
            ),
            bucket: v.string(),
            startTsSec: v.number(),
            endTsSec: v.number(),
            quoteAsset: v.string(),
            points: v.number(),
            series: v.array(EquitySeriesSchema),
            btcPricesQ: v.optional(v.array(v.bigint()), []),
        }),
        v.transform((data) => ({
            range: data.range,
            bucket: data.bucket,
            startTsSec: data.startTsSec,
            endTsSec: data.endTsSec,
            quoteAsset: data.quoteAsset,
            points: data.points,
            series: data.series,
            // BTC price in USDT at each timestamp, carried as price ticks on the wire.
            btcPrices: data.btcPricesQ.map((value) => scaledToDecimalOutput(value, scales.price())),
        })),
    );
}

export type EquitySeries = v.InferOutput<typeof EquitySeriesSchema>;
export type EquityHistoryResponse = v.InferOutput<
    ReturnType<typeof createEquityHistoryResponseSchema>
>;
