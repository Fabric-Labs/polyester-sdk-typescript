import * as v from "valibot";
import {
    PerpMarketRuleSchema,
    PolicyActionEnumSchema,
    PolicyMarketScopeEnumSchema,
    ProtoPolicyActionEnumSchema,
    ProtoPolicyMarketScopeEnumSchema,
    SpotMarketRuleSchema,
} from "../shared.js";
import { PolicyMarketScopeCodec, PolicyActionCodec } from "../shared.codecs.js";
import { bpsToPct, toBigIntOrZero, toBpsOrZero, toIntOrZero } from "../../../utils/numbers.js";
import { formatId, idToBigInt } from "../../../utils/base58-id.js";
import {
    TimestampSchema,
    TimestampMsSchema,
    idInputSchema,
    optionalSubaccountIdInputSchema,
} from "../../../shared/schemas.js";
import { tsObjToMs } from "../../../utils/time.js";

const OptionalNumberDefaultNull = v.nullable(v.optional(v.number()));

/**
 * From the backend format to a usable frontend/UI format, so big ints to numbers, etc.
 */
export const SubaccountPolicySchema = v.pipe(
    v.object({
        id: v.pipe(
            v.bigint(),
            v.transform((v) => formatId(v)),
        ),
        name: v.string(),
        description: v.string(),
        spotMarkets: v.optional(v.array(SpotMarketRuleSchema), []),
        spotMarketScope: v.pipe(
            ProtoPolicyMarketScopeEnumSchema,
            v.transform((v) => PolicyMarketScopeCodec.protoToOutput[v]),
        ),
        perpMarketScope: v.pipe(
            ProtoPolicyMarketScopeEnumSchema,
            v.transform((v) => PolicyMarketScopeCodec.protoToOutput[v]),
        ),
        perpMarkets: v.optional(v.array(PerpMarketRuleSchema), []),
        actions: v.pipe(
            v.optional(v.array(ProtoPolicyActionEnumSchema), []),
            v.transform((v) => v.map((action) => PolicyActionCodec.protoToOutput[action])),
        ),
        isTemplate: v.optional(v.optional(v.boolean()), false),
        sourceTemplateId: v.pipe(
            v.bigint(),
            v.transform((v) => (v ? formatId(v) : undefined)),
        ),
        globalNotionalCap: v.pipe(
            v.bigint(),
            v.transform((v) => Number(v)),
        ),
        maxOrderNotional: v.pipe(
            v.bigint(),
            v.transform((v) => Number(v)),
        ),
        maxOpenOrders: v.number(),
        maxOpenPositions: v.number(),
        globalPerpLeverageX: v.number(),
        dailyInternalTransferOutLimit: v.pipe(
            v.bigint(),
            v.transform((v) => Number(v)),
        ),
        dailyWithdrawLimit: v.pipe(
            v.bigint(),
            v.transform((v) => Number(v)),
        ),
        internalTransfersOwnOnly: v.boolean(),
        enforceWithdrawWhitelist: v.boolean(),
        tradingHalted: v.boolean(),
        liquidationOnly: v.boolean(),
        dailyLossLimit: v.pipe(
            v.bigint(),
            v.transform((v) => Number(v)),
        ),
        intradayDrawdownLimitBps: v.pipe(
            v.number(),
            v.transform((v) => bpsToPct(v)),
        ),
        locked: v.boolean(),
        reviewAt: v.pipe(
            v.optional(TimestampSchema),
            v.transform((v) => {
                if (v === undefined) return undefined;
                if (v === null) return 0;
                return tsObjToMs(v);
            }),
        ),
        expiresAt: v.pipe(
            v.optional(TimestampSchema),
            v.transform((v) => {
                if (v === undefined) return undefined;
                if (v === null) return 0;
                return tsObjToMs(v);
            }),
        ),
        createdAt: TimestampMsSchema,
        updatedAt: TimestampMsSchema,
    }),
    v.transform(({ maxOrderNotional, globalNotionalCap, intradayDrawdownLimitBps, ...rest }) => ({
        maxOrderSize: maxOrderNotional,
        globalExposureCap: globalNotionalCap,
        intradayDrawdownLimitPct: intradayDrawdownLimitBps,
        ...rest,
    })),
);

export type SubaccountPolicy = v.InferOutput<typeof SubaccountPolicySchema>;

const SubaccountPolicyInputBaseSchema = v.object({
    name: v.string(),
    description: v.optional(v.optional(v.string()), ""),
    spotMarkets: v.optional(v.optional(v.array(SpotMarketRuleSchema)), []),
    perpMarkets: v.optional(v.optional(v.array(PerpMarketRuleSchema)), []),
    spotMarketScope: v.pipe(
        PolicyMarketScopeEnumSchema,
        v.transform((v) => PolicyMarketScopeCodec.inputToProto[v]),
    ),
    perpMarketScope: v.pipe(
        PolicyMarketScopeEnumSchema,
        v.transform((v) => PolicyMarketScopeCodec.inputToProto[v]),
    ),
    actions: v.pipe(
        v.optional(v.optional(v.array(PolicyActionEnumSchema)), []),
        v.transform((v) => (v ?? []).map((action) => PolicyActionCodec.outputToProto[action])),
    ),
    globalLeverageCap: v.pipe(OptionalNumberDefaultNull, v.transform(toIntOrZero)),
    globalExposureCap: v.pipe(OptionalNumberDefaultNull, v.transform(toBigIntOrZero)),
    maxOrderSize: v.pipe(OptionalNumberDefaultNull, v.transform(toBigIntOrZero)),
    maxOpenOrders: v.pipe(OptionalNumberDefaultNull, v.transform(toIntOrZero)),
    maxOpenPositions: v.pipe(OptionalNumberDefaultNull, v.transform(toIntOrZero)),
    dailyInternalTransferLimit: v.pipe(OptionalNumberDefaultNull, v.transform(toBigIntOrZero)),
    dailyWithdrawLimit: v.pipe(OptionalNumberDefaultNull, v.transform(toBigIntOrZero)),
    dailyLossLimit: v.pipe(OptionalNumberDefaultNull, v.transform(toBigIntOrZero)),
    intradayDrawdownLimitPct: v.pipe(OptionalNumberDefaultNull, v.transform(toBpsOrZero)),
    tradingHalted: v.optional(v.optional(v.boolean()), false),
    liquidationOnly: v.optional(v.optional(v.boolean()), false),
    policyLocked: v.optional(v.optional(v.boolean()), false),
    internalTransfersOwnOnly: v.optional(v.optional(v.boolean()), true),
    enforceWithdrawWhitelist: v.optional(v.optional(v.boolean()), false),
    subaccountId: optionalSubaccountIdInputSchema(),
});

function createSubaccountPolicyBaseTransform(
    input: v.InferOutput<typeof SubaccountPolicyInputBaseSchema>,
) {
    return {
        ...input,
        globalNotionalCap: input.globalExposureCap,
        maxOrderNotional: input.maxOrderSize,
        globalPerpLeverageX: input.globalLeverageCap,
        dailyInternalTransferOutLimit: input.dailyInternalTransferLimit,
        intradayDrawdownLimitBps: input.intradayDrawdownLimitPct,
        locked: input.policyLocked,
        subaccountId: input.subaccountId,
    };
}

export const CreateSubaccountPolicyInputSchema = v.pipe(
    SubaccountPolicyInputBaseSchema,
    v.transform(createSubaccountPolicyBaseTransform),
);
export type SubaccountPolicyCreateInput = v.InferInput<typeof CreateSubaccountPolicyInputSchema>;

export const UpdateSubaccountPolicyInputSchema = v.pipe(
    v.object({
        ...SubaccountPolicyInputBaseSchema.entries,

        policyId: v.pipe(
            v.string(),
            v.transform((v) => idToBigInt(v, "policyId")),
        ),
    }),
    v.transform(({ policyId, ...rest }) => {
        return {
            ...createSubaccountPolicyBaseTransform(rest),
            policyId,
        };
    }),
);
export type SubaccountPolicyUpdateInput = v.InferInput<typeof UpdateSubaccountPolicyInputSchema>;

export const PolicyIdSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.transform((v) => idToBigInt(v, "policyId")),
);

export const ApplySubaccountPolicyInputSchema = v.object({
    subaccountId: idInputSchema("subaccountId"),
    policyId: v.pipe(
        v.nullable(v.pipe(v.string(), v.trim())),
        v.transform((value) => (value ? idToBigInt(value, "policyId") : undefined)),
    ),
});

export type SubaccountPolicyApplyInput = v.InferInput<typeof ApplySubaccountPolicyInputSchema>;

export const DEFAULT_SUBACCOUNT_POLICY: SubaccountPolicy = {
    id: "",
    name: "Subaccount Policy",
    description: "Subaccount Policy description",
    spotMarkets: [],
    perpMarkets: [],
    spotMarketScope: "all",
    perpMarketScope: "all",
    actions: [
        "read-balances",
        "read-external-withdrawals",
        "read-internal-transfers",
        "read-perp",
        "read-spot",
    ],
    globalExposureCap: 0,
    maxOrderSize: 0,
    maxOpenOrders: 0,
    maxOpenPositions: 0,
    globalPerpLeverageX: 0,
    dailyInternalTransferOutLimit: 0,
    dailyWithdrawLimit: 0,
    internalTransfersOwnOnly: true,
    enforceWithdrawWhitelist: false,
    tradingHalted: false,
    liquidationOnly: false,
    dailyLossLimit: 0,
    createdAt: new Date().getTime(),
    updatedAt: new Date().getTime(),
    isTemplate: false,
    sourceTemplateId: undefined,
    locked: false,
    reviewAt: undefined,
    expiresAt: undefined,
    intradayDrawdownLimitPct: 0,
};
