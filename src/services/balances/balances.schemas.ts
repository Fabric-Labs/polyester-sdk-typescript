import * as v from "valibot";
import { fromU128, u128ToDecimal } from "../../utils/u128.js";
import {
    createCatalogSnapshotReader,
    LEDGER_SCALE,
    staticCatalog,
    type CatalogReader,
    type CatalogSnapshot,
} from "../../catalogs/index.js";
import { optionalSubaccountIdInputSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { BalanceRangeCodec, EquityGroupByCodec } from "./balances.codecs.js";

const U128Schema = v.object({
    hi: v.bigint(),
    lo: v.bigint(),
});

export function createLedgerBalanceSchema(catalog: CatalogSnapshot) {
    return createLedgerBalanceSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createLedgerBalanceSchemaForReader(reader: CatalogReader) {
    return v.pipe(
        v.object({
            assetId: v.number(),
            trading: v.optional(U128Schema),
            unified: v.optional(U128Schema),
            funding: v.pipe(v.optional(U128Schema), v.transform(fromU128)),
            reserved: v.pipe(v.optional(U128Schema), v.transform(fromU128)),
            available: v.pipe(v.optional(U128Schema), v.transform(fromU128)),
        }),
        v.transform((b) => {
            const aid = b.assetId;
            const unified = fromU128(b.trading ?? b.unified);

            return {
                asset: reader.ledger.requireAssetByLedgerId(aid),
                funding: parseFloat(u128ToDecimal(b.funding ?? 0n, LEDGER_SCALE)),
                unified: parseFloat(u128ToDecimal(unified, LEDGER_SCALE)),
                reserved: parseFloat(u128ToDecimal(b.reserved ?? 0n, LEDGER_SCALE)),
                available: parseFloat(u128ToDecimal(b.available ?? 0n, LEDGER_SCALE)),
            };
        }),
    );
}

export const LedgerBalanceSchema = createLedgerBalanceSchemaForReader(staticCatalog);

export type LedgerBalance = v.InferOutput<typeof LedgerBalanceSchema>;

export const BALANCE_RANGES = ["1d", "7d", "30d", "90d", "180d", "365d"] as const;

export const BalanceRangeSchema = v.picklist(BALANCE_RANGES);

export type BalanceRange = v.InferOutput<typeof BalanceRangeSchema>;

export const EQUITY_GROUP_BYS = ["account", "asset"] as const;

export const EquityGroupBySchema = v.picklist(EQUITY_GROUP_BYS);

export type EquityGroupBy = v.InferOutput<typeof EquityGroupBySchema>;

export const BalanceHistoryInputSchema = v.object({
    subaccountId: optionalSubaccountIdInputSchema(),
    range: v.pipe(
        BalanceRangeSchema,
        v.transform((v) => BalanceRangeCodec.inputToProto[v]),
    ),
    ledger: v.optional(v.number(), 0),
    accountCodes: v.optional(v.array(v.number()), []),
});

export type BalanceHistoryInput = v.InferInput<typeof BalanceHistoryInputSchema>;

export const BalanceSeriesSchema = v.object({
    assetId: v.number(),
    accountCode: v.number(),
    balanceQ: v.array(v.bigint()),
});

export function createBalanceHistoryResponseSchema(catalog: CatalogSnapshot) {
    return createBalanceHistoryResponseSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createBalanceHistoryResponseSchemaForReader(reader: CatalogReader) {
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
            series: data.series.map((s) => ({
                asset: reader.ledger.requireAssetByLedgerId(s.assetId),
                accountCode: s.accountCode,
                // balanceQ is scaled by 1e7, convert to float array
                balances: s.balanceQ.map((b) => Number(b) / 1e7),
            })),
        })),
    );
}

export const BalanceHistoryResponseSchema =
    createBalanceHistoryResponseSchemaForReader(staticCatalog);

export type BalanceHistoryResponse = v.InferOutput<typeof BalanceHistoryResponseSchema>;

export const EquityHistoryInputSchema = v.object({
    subaccountId: optionalSubaccountIdInputSchema(),
    range: v.pipe(
        BalanceRangeSchema,
        v.transform((v) => BalanceRangeCodec.inputToProto[v]),
    ),
    accountCodes: v.optional(v.array(v.number()), []),
    groupBy: v.pipe(
        v.optional(EquityGroupBySchema, "account"),
        v.transform((v) => EquityGroupByCodec.inputToProto[v ?? "account"]),
    ),
});

export type EquityHistoryInput = v.InferInput<typeof EquityHistoryInputSchema>;

const EquitySeriesGroupingSchema = v.union([
    v.object({
        case: v.literal("account"),
        value: v.object({
            code: v.number(),
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
          accountCode: number;
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
    v.transform((series): { grouping: EquitySeriesGrouping; equityQ: bigint[] } => {
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
    }),
);

export const EquityHistoryResponseSchema = v.pipe(
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
        btcPricesQ: data.btcPricesQ,
    })),
);

export type EquitySeries = v.InferOutput<typeof EquitySeriesSchema>;
export type EquityHistoryResponse = v.InferOutput<typeof EquityHistoryResponseSchema>;
