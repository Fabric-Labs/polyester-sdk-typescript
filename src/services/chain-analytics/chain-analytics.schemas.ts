import * as Proto from "../../gen/chain/analytics/v1/analytics_read_pb.js";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import * as v from "valibot";
import {
    CHAIN_ANALYTICS_RANGE_VALUES,
    ChainAnalyticsRangeCodec,
} from "./chain-analytics.codecs.js";

export { CHAIN_ANALYTICS_RANGE_VALUES } from "./chain-analytics.codecs.js";

const maxUint32 = 4_294_967_295;

const PositiveUint32Schema = v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(maxUint32));
const NonNegativeUint32Schema = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(maxUint32),
);
const OptionalUint32Schema = v.optional(NonNegativeUint32Schema);

export const ChainAnalyticsRangeSchema = v.picklist(CHAIN_ANALYTICS_RANGE_VALUES);

export type ChainAnalyticsRange = v.InferOutput<typeof ChainAnalyticsRangeSchema>;

const ChainAnalyticsRangeInputSchema = v.pipe(
    v.optional(ChainAnalyticsRangeSchema, "1d"),
    v.transform((value) => ChainAnalyticsRangeCodec.inputToProto[value]),
);

const ChainAnalyticsRangeOutputSchema = v.pipe(
    v.enum(Proto.ChainAnalyticsRange),
    v.transform((value) =>
        requiredEnumLabel(
            ChainAnalyticsRangeCodec.protoToOutput,
            value,
            "ChainAnalyticsRangeSchema",
            "range",
        ),
    ),
);

const OptionalBucketInputSchema = v.optional(v.pipe(v.string(), v.trim()), "");

const ChainAnalyticsWindowInputEntries = {
    range: ChainAnalyticsRangeInputSchema,
    bucket: OptionalBucketInputSchema,
    startTsSec: OptionalUint32Schema,
    endTsSec: OptionalUint32Schema,
};

const ChainAnalyticsResponseEntries = {
    range: ChainAnalyticsRangeOutputSchema,
    bucket: v.string(),
    startTsSec: NonNegativeUint32Schema,
    endTsSec: NonNegativeUint32Schema,
    points: NonNegativeUint32Schema,
};

function scaledArray(values: readonly bigint[], scale: number): string[] {
    return values.map((value) => scaledToDecimalOutput(value, scale));
}

export const GetZippedAssetSupplyInputSchema = v.strictObject({
    zippedAssetId: PositiveUint32Schema,
    ...ChainAnalyticsWindowInputEntries,
});

export const GetZippedAssetSupplyGroupInputSchema = v.strictObject({
    groupId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    ...ChainAnalyticsWindowInputEntries,
});

export const GetUnifiedAssetBalancesInputSchema = v.strictObject({
    assetId: PositiveUint32Schema,
    ...ChainAnalyticsWindowInputEntries,
});

export function createZippedAssetSupplyResponseSchema(scales: SdkScales) {
    return v.pipe(
        v.object({
            zippedAssetId: v.number(),
            ...ChainAnalyticsResponseEntries,
            totalSupplyQ: v.array(v.bigint()),
        }),
        v.check(
            (data) => data.endTsSec >= data.startTsSec,
            "endTsSec must be greater than or equal to startTsSec",
        ),
        v.check(
            (data) => data.totalSupplyQ.length === data.points,
            "points must match totalSupply column length",
        ),
        v.transform((data) => ({
            zippedAssetId: data.zippedAssetId,
            range: data.range,
            bucket: data.bucket,
            startTsSec: data.startTsSec,
            endTsSec: data.endTsSec,
            points: data.points,
            totalSupply: scaledArray(
                data.totalSupplyQ,
                scales.zippedAssetAmount(data.zippedAssetId),
            ),
        })),
    );
}

export function createZippedAssetSupplySeriesSchema(scales: SdkScales) {
    return v.pipe(
        v.object({
            zippedAssetId: v.number(),
            totalSupplyQ: v.array(v.bigint()),
        }),
        v.transform((series) => ({
            zippedAssetId: series.zippedAssetId,
            totalSupply: scaledArray(
                series.totalSupplyQ,
                scales.zippedAssetAmount(series.zippedAssetId),
            ),
        })),
    );
}

export function createZippedAssetSupplyGroupResponseSchema(scales: SdkScales) {
    const seriesSchema = createZippedAssetSupplySeriesSchema(scales);
    return v.pipe(
        v.object({
            groupId: v.string(),
            ...ChainAnalyticsResponseEntries,
            series: v.array(seriesSchema),
        }),
        v.check(
            (data) => data.endTsSec >= data.startTsSec,
            "endTsSec must be greater than or equal to startTsSec",
        ),
        v.check(
            (data) => data.series.every((series) => series.totalSupply.length === data.points),
            "points must match each totalSupply column length",
        ),
        v.transform((data) => ({
            groupId: data.groupId,
            range: data.range,
            bucket: data.bucket,
            startTsSec: data.startTsSec,
            endTsSec: data.endTsSec,
            points: data.points,
            series: data.series,
        })),
    );
}

export function createUnifiedAssetBalancesResponseSchema(scales: SdkScales) {
    return v.pipe(
        v.object({
            assetId: v.number(),
            ...ChainAnalyticsResponseEntries,
            totalBalanceQ: v.array(v.bigint()),
        }),
        v.check(
            (data) => data.endTsSec >= data.startTsSec,
            "endTsSec must be greater than or equal to startTsSec",
        ),
        v.check(
            (data) => data.totalBalanceQ.length === data.points,
            "points must match totalBalance column length",
        ),
        v.transform((data) => ({
            assetId: data.assetId,
            range: data.range,
            bucket: data.bucket,
            startTsSec: data.startTsSec,
            endTsSec: data.endTsSec,
            points: data.points,
            totalBalance: scaledArray(data.totalBalanceQ, scales.ledgerAmount(data.assetId)),
        })),
    );
}

export type GetZippedAssetSupplyInput = v.InferInput<typeof GetZippedAssetSupplyInputSchema>;

export type GetZippedAssetSupplyGroupInput = v.InferInput<
    typeof GetZippedAssetSupplyGroupInputSchema
>;

export type GetUnifiedAssetBalancesInput = v.InferInput<typeof GetUnifiedAssetBalancesInputSchema>;

export type ZippedAssetSupplyResponse = v.InferOutput<
    ReturnType<typeof createZippedAssetSupplyResponseSchema>
>;
export type ZippedAssetSupplySeries = v.InferOutput<
    ReturnType<typeof createZippedAssetSupplySeriesSchema>
>;
export type ZippedAssetSupplyGroupResponse = v.InferOutput<
    ReturnType<typeof createZippedAssetSupplyGroupResponseSchema>
>;
export type UnifiedAssetBalancesResponse = v.InferOutput<
    ReturnType<typeof createUnifiedAssetBalancesResponseSchema>
>;
