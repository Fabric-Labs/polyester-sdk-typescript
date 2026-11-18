import * as v from "valibot";
import { MemoRequirement, RouteStatus, SupplyStatus } from "../../gen/chain/zipper/v1/zipper_pb.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import { OptionalTimestampMsSchema } from "../../shared/schemas.js";
import type { ProtoToOutput } from "../../utils/types.js";
import type {
    DepositWithdrawConfig,
    ZipperAssetChainVariant,
    ZipperAssetConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
    ZipperMemoRequirement,
    ZipperRouteStatus,
    ZipperSupplyStatus,
} from "../../shared/catalog-config.js";
import { scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";

export type {
    DepositWithdrawConfig,
    ZipperAssetChainVariant,
    ZipperAssetConfig,
    ZipperChainConfig,
    ZipperChainContractConfig,
    ZipperMemoRequirement,
    ZipperRouteStatus,
    ZipperSupplyStatus,
};

export const ZipperMemoRequirementCodec = {
    protoToOutput: {
        [MemoRequirement.MEMO_UNSPECIFIED]: "unspecified",
        [MemoRequirement.REQUIRED]: "required",
        [MemoRequirement.OPTIONAL]: "optional",
        [MemoRequirement.NOT_SUPPORTED]: "not_supported",
    } satisfies ProtoToOutput<MemoRequirement, ZipperMemoRequirement>,
} as const;

export const ZipperRouteStatusCodec = {
    protoToOutput: {
        [RouteStatus.STATUS_UNSPECIFIED]: "unspecified",
        [RouteStatus.NORMAL]: "normal",
        [RouteStatus.SUSPENDED]: "suspended",
    } satisfies ProtoToOutput<RouteStatus, ZipperRouteStatus>,
} as const;

export const ZipperSupplyStatusCodec = {
    protoToOutput: {
        [SupplyStatus.SUPPLY_UNSPECIFIED]: "unspecified",
        [SupplyStatus.AVAILABLE]: "available",
        [SupplyStatus.STALE]: "stale",
        [SupplyStatus.MISSING]: "missing",
    } satisfies ProtoToOutput<SupplyStatus, ZipperSupplyStatus>,
} as const;

/** Only these statuses carry a supply; any other leaves it unknown, never zero. */
export function hasSupply(status: ZipperSupplyStatus | undefined): status is "available" | "stale" {
    return status === "available" || status === "stale";
}

export const ZipperChainConfigSchema = v.object({
    chainId: v.number(),
    code: v.string(),
    name: v.string(),
    nativeChainId: v.optional(v.string(), ""),
    nativeCurrencySymbol: v.string(),
    explorerUrl: v.string(),
    icon: v.string(),
    requiredConfirmations: v.number(),
    confirmationTimeSeconds: v.number(),
    isCaseSensitive: v.optional(v.boolean(), false),
    minAddressLength: v.number(),
    maxAddressLength: v.number(),
    memoRequirement: v.optional(enumLabelSchema(ZipperMemoRequirementCodec.protoToOutput), 0),
    memoLabel: v.optional(v.string(), ""),
    memoFormatHint: v.optional(v.string(), ""),
});

const ZipperAssetChainVariantWireSchema = v.object({
    zippedAssetId: v.number(),
    chainId: v.number(),
    isNativeAsset: v.optional(v.boolean(), false),
    networkFee: v.optional(v.string(), "0"),
    networkFeeTsSec: v.pipe(v.optional(v.bigint(), 0n), v.transform(Number)),
    ztokenAddress: v.optional(v.string(), ""),
    sourceAddress: v.optional(v.string(), ""),
    sourceDecimals: v.optional(v.number(), 18),
    ztokenDecimals: v.optional(v.number(), 18),
    depositMinAmount: v.optional(v.string(), ""),
    withdrawMinAmount: v.optional(v.string(), ""),
    supplyQ: v.optional(v.bigint(), 0n),
    /**
     * Whether the route accepts new deposits. While `"suspended"`, do not send funds to a
     * deposit address on it; wait until it is `"normal"`. `"unspecified"` means unknown.
     */
    depositStatus: v.optional(enumLabelSchema(ZipperRouteStatusCodec.protoToOutput), 0),
    /**
     * Whether the route accepts new withdrawals; a new one is refused with `ROUTE_SUSPENDED`
     * while `"suspended"`. A Trading withdrawal accepted earlier and not yet sent stays
     * pending, funds held, until the route is `"normal"`; one already being sent may fail
     * instead, returning its funds. `"unspecified"` means unknown, not suspended.
     */
    withdrawalStatus: v.optional(enumLabelSchema(ZipperRouteStatusCodec.protoToOutput), 0),
    supplyStatus: v.optional(enumLabelSchema(ZipperSupplyStatusCodec.protoToOutput), 0),
    supplyObservedAt: OptionalTimestampMsSchema,
});

function normalizeZipperAssetChainVariant(
    quantityScale: number,
    {
        sourceAddress,
        sourceDecimals,
        supplyQ,
        supplyObservedAt,
        ztokenAddress,
        ztokenDecimals,
        ...variant
    }: v.InferOutput<typeof ZipperAssetChainVariantWireSchema>,
): ZipperAssetChainVariant {
    return {
        ...variant,
        ...(hasSupply(variant.supplyStatus) && {
            supply: scaledToDecimalOutput(supplyQ, quantityScale),
            ...(supplyObservedAt !== undefined && { supplyObservedAt }),
        }),
        sourceToken: {
            address: sourceAddress,
            decimals: sourceDecimals,
        },
        zToken: {
            address: ztokenAddress,
            decimals: ztokenDecimals,
        },
    };
}

export const ZipperAssetConfigSchema = v.pipe(
    v.object({
        asset: v.string(),
        ledgerId: v.number(),
        name: v.string(),
        icon: v.string(),
        quantityScale: v.number(),
        quantityDisplayDecimals: v.number(),
        variants: v.array(ZipperAssetChainVariantWireSchema),
        uAssetId: v.optional(v.string(), ""),
    }),
    v.transform(({ variants, ...asset }) => ({
        ...asset,
        variants: variants.map((variant) =>
            normalizeZipperAssetChainVariant(asset.quantityScale, variant),
        ),
    })),
);

export const ZipperChainContractConfigSchema = v.object({
    name: v.string(),
    address: v.string(),
    type: v.optional(v.string(), ""),
    description: v.optional(v.string(), ""),
    version: v.optional(v.number(), 0),
});

export const DepositWithdrawConfigSchema = v.pipe(
    v.object({
        chains: v.array(ZipperChainConfigSchema),
        assets: v.array(ZipperAssetConfigSchema),
        tsSec: v.bigint(),
        contracts: v.optional(v.array(ZipperChainContractConfigSchema), []),
    }),
    v.transform(({ tsSec, ...config }) => ({
        ...config,
        tsMs: Number(tsSec) * 1000,
    })),
);

const ZippedAssetSupplyUpdateWireSchema = v.object({
    zippedAssetId: v.number(),
    supplyQ: v.bigint(),
    status: v.optional(enumLabelSchema(ZipperSupplyStatusCodec.protoToOutput), 0),
    observedAt: OptionalTimestampMsSchema,
});

/** A route's latest known zToken supply. Routes whose supply is unknown are left out. */
export type ZippedAssetSupplyUpdate = {
    zippedAssetId: number;
    supply: string;
    /** `"stale"`: the last value read, no longer refreshed; do not size a withdrawal against it. */
    status: "available" | "stale";
    /** Epoch ms when `supply` was read. */
    observedAt?: number;
};

export type ZippedAssetSupplyBatch = {
    updates: ZippedAssetSupplyUpdate[];
};

export function createZippedAssetSupplyBatchSchema(scales: SdkScales) {
    return v.pipe(
        v.object({
            updates: v.array(ZippedAssetSupplyUpdateWireSchema),
        }),
        v.transform(
            (batch): ZippedAssetSupplyBatch => ({
                updates: batch.updates.flatMap(({ zippedAssetId, supplyQ, status, observedAt }) =>
                    hasSupply(status)
                        ? [
                              {
                                  zippedAssetId,
                                  supply: scaledToDecimalOutput(
                                      supplyQ,
                                      scales.zippedAssetAmount(zippedAssetId),
                                  ),
                                  status,
                                  ...(observedAt !== undefined && { observedAt }),
                              },
                          ]
                        : [],
                ),
            }),
        ),
    );
}
