import * as v from "valibot";
import {
    PerpMarketRuleSchema,
    PolicyActionEnumSchema,
    PolicyMarketScopeEnumSchema,
    ProtoPolicyActionEnumSchema,
    ProtoPolicyMarketScopeEnumSchema,
    SpotMarketRuleSchema,
} from "../shared.js";
import {
    PolicyMarketScopeCodec,
    PolicyActionCodec,
    policyMarketScopeLabelFor,
    policyActionLabelFor,
} from "../shared.codecs.js";
import { bpsToPct } from "../../../utils/numbers.js";
import { idToBigInt } from "../../../utils/base58-id.js";
import {
    OptionalNumberToBigIntOrZeroSchema,
    OptionalNumberToBpsOrZeroSchema,
    OptionalNumberToIntOrZeroSchema,
    OptionalPublicIdSchema,
    OptionalTimestampMsSchema,
    BigIntStringSchema,
    PublicIdSchema,
    TimestampSchema,
    TimestampMsSchema,
    idInputSchema,
    optionalSubaccountIdInputSchema,
    positiveBigintStringInputSchema,
} from "../../../shared/schemas.js";
import { tsObjToMs, tsObjToNsString } from "../../../utils/time.js";
import { toTimestamp } from "../../../utils/timestamp.js";
import { toBigIntOrZero, toBpsOrZero, toIntOrZero } from "../../../utils/numbers.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../../shared/account-scope.js";
import { buildProtoPatch, defineProtoPatchFields } from "../../../utils/proto-patch.js";

export const ListSubaccountPoliciesInputSchema = v.pipe(
    v.strictObject(AccountScopeInputEntries),
    v.transform(({ account }) => ({
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type ListSubaccountPoliciesInput = v.InferInput<typeof ListSubaccountPoliciesInputSchema>;

export const GetSubaccountPolicyInputSchema = v.pipe(
    v.strictObject({
        policyId: v.pipe(v.string(), v.trim(), v.minLength(1)),
        ...AccountScopeInputEntries,
    }),
    v.transform(({ policyId, account }) => ({
        policyId: idToBigInt(policyId, "policyId"),
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type GetSubaccountPolicyInput = v.InferInput<typeof GetSubaccountPolicyInputSchema>;

/**
 * From the backend format to a usable frontend/UI format, so big ints to numbers, etc.
 */
export const SubaccountPolicySchema = v.pipe(
    v.object({
        id: PublicIdSchema,
        name: v.string(),
        description: v.string(),
        spotMarkets: v.optional(v.array(SpotMarketRuleSchema), []),
        spotMarketScope: v.pipe(
            ProtoPolicyMarketScopeEnumSchema,
            v.transform((v) => policyMarketScopeLabelFor(v)),
        ),
        perpMarketScope: v.pipe(
            ProtoPolicyMarketScopeEnumSchema,
            v.transform((v) => policyMarketScopeLabelFor(v)),
        ),
        perpMarkets: v.optional(v.array(PerpMarketRuleSchema), []),
        actions: v.pipe(
            v.optional(v.array(ProtoPolicyActionEnumSchema), []),
            v.transform((v) => v.map((action) => policyActionLabelFor(action))),
        ),
        isTemplate: v.optional(v.boolean(), false),
        sourceTemplateId: OptionalPublicIdSchema,
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
        reviewAt: OptionalTimestampMsSchema,
        expiresAt: OptionalTimestampMsSchema,
        createdAt: TimestampMsSchema,
        updatedAt: TimestampSchema,
        revision: BigIntStringSchema,
    }),
    v.transform(
        ({
            maxOrderNotional,
            globalNotionalCap,
            intradayDrawdownLimitBps,
            updatedAt,
            ...rest
        }) => ({
            maxOrderSize: maxOrderNotional,
            globalExposureCap: globalNotionalCap,
            intradayDrawdownLimitPct: intradayDrawdownLimitBps,
            ...rest,
            updatedAt: tsObjToMs(updatedAt),
            updatedAtNs: tsObjToNsString(updatedAt),
        }),
    ),
);

export type SubaccountPolicy = v.InferOutput<typeof SubaccountPolicySchema>;

const SubaccountPolicyInputBaseSchema = v.strictObject({
    name: v.string(),
    description: v.optional(v.string(), ""),
    spotMarkets: v.optional(v.array(SpotMarketRuleSchema), []),
    perpMarkets: v.optional(v.array(PerpMarketRuleSchema), []),
    spotMarketScope: v.pipe(
        PolicyMarketScopeEnumSchema,
        v.transform((v) => PolicyMarketScopeCodec.inputToProto[v]),
    ),
    perpMarketScope: v.pipe(
        PolicyMarketScopeEnumSchema,
        v.transform((v) => PolicyMarketScopeCodec.inputToProto[v]),
    ),
    actions: v.pipe(
        v.optional(v.array(PolicyActionEnumSchema), ["read-balances", "read-spot"]),
        v.transform((v) => (v ?? []).map((action) => PolicyActionCodec.inputToProto[action])),
    ),
    globalLeverageCap: OptionalNumberToIntOrZeroSchema,
    globalExposureCap: OptionalNumberToBigIntOrZeroSchema,
    maxOrderSize: OptionalNumberToBigIntOrZeroSchema,
    maxOpenOrders: OptionalNumberToIntOrZeroSchema,
    maxOpenPositions: OptionalNumberToIntOrZeroSchema,
    dailyInternalTransferLimit: OptionalNumberToBigIntOrZeroSchema,
    dailyWithdrawLimit: OptionalNumberToBigIntOrZeroSchema,
    dailyLossLimit: OptionalNumberToBigIntOrZeroSchema,
    intradayDrawdownLimitPct: OptionalNumberToBpsOrZeroSchema,
    tradingHalted: v.optional(v.boolean(), false),
    liquidationOnly: v.optional(v.boolean(), false),
    policyLocked: v.optional(v.boolean(), false),
    internalTransfersOwnOnly: v.optional(v.boolean(), true),
    enforceWithdrawWhitelist: v.optional(v.boolean(), false),
    reviewAt: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
    expiresAt: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
    subaccountId: optionalSubaccountIdInputSchema(),
});

function timestampFromMs(value: number | null | undefined) {
    if (value == null) return undefined;
    return toTimestamp({
        seconds: BigInt(Math.floor(value / 1000)),
        nanos: (value % 1000) * 1_000_000,
    });
}

function createSubaccountPolicyBaseTransform(
    input: v.InferOutput<typeof SubaccountPolicyInputBaseSchema>,
) {
    const {
        subaccountId: _subaccountId,
        reviewAt,
        expiresAt,
        globalExposureCap,
        maxOrderSize,
        globalLeverageCap,
        dailyInternalTransferLimit,
        intradayDrawdownLimitPct,
        policyLocked,
        ...rest
    } = input;
    return {
        ...rest,
        globalNotionalCap: globalExposureCap,
        maxOrderNotional: maxOrderSize,
        globalPerpLeverageX: globalLeverageCap,
        dailyInternalTransferOutLimit: dailyInternalTransferLimit,
        intradayDrawdownLimitBps: intradayDrawdownLimitPct,
        locked: policyLocked,
        reviewAt: timestampFromMs(reviewAt),
        expiresAt: timestampFromMs(expiresAt),
    };
}

export const CreateSubaccountPolicyInputSchema = v.pipe(
    SubaccountPolicyInputBaseSchema,
    v.check(
        ({ actions }) =>
            actions.includes(PolicyActionCodec.inputToProto["read-balances"]) &&
            actions.includes(PolicyActionCodec.inputToProto["read-spot"]),
        "Subaccount policy actions must include read-balances and read-spot",
    ),
    v.transform((input) => ({
        policy: createSubaccountPolicyBaseTransform(input),
        subaccountId: input.subaccountId,
    })),
);
export type SubaccountPolicyCreateInput = v.InferInput<typeof CreateSubaccountPolicyInputSchema>;

const SubaccountPolicyPatchSchema = v.strictObject({
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    spotMarkets: v.optional(v.array(SpotMarketRuleSchema)),
    perpMarkets: v.optional(v.array(PerpMarketRuleSchema)),
    spotMarketScope: v.optional(PolicyMarketScopeEnumSchema),
    perpMarketScope: v.optional(PolicyMarketScopeEnumSchema),
    actions: v.optional(v.array(PolicyActionEnumSchema)),
    globalLeverageCap: v.optional(v.nullable(v.number())),
    globalExposureCap: v.optional(v.nullable(v.number())),
    maxOrderSize: v.optional(v.nullable(v.number())),
    maxOpenOrders: v.optional(v.nullable(v.number())),
    maxOpenPositions: v.optional(v.nullable(v.number())),
    dailyInternalTransferLimit: v.optional(v.nullable(v.number())),
    dailyWithdrawLimit: v.optional(v.nullable(v.number())),
    dailyLossLimit: v.optional(v.nullable(v.number())),
    intradayDrawdownLimitPct: v.optional(v.nullable(v.number())),
    tradingHalted: v.optional(v.boolean()),
    liquidationOnly: v.optional(v.boolean()),
    policyLocked: v.optional(v.boolean()),
    internalTransfersOwnOnly: v.optional(v.boolean()),
    enforceWithdrawWhitelist: v.optional(v.boolean()),
    reviewAt: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
    expiresAt: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
});

type SubaccountPolicyPatch = v.InferOutput<typeof SubaccountPolicyPatchSchema>;

const SUBACCOUNT_POLICY_PATCH_FIELDS = defineProtoPatchFields<SubaccountPolicyPatch>()({
    name: { path: "name", encode: (name) => ({ name }) },
    description: { path: "description", encode: (description) => ({ description }) },
    spotMarkets: { path: "spot_markets", encode: (spotMarkets) => ({ spotMarkets }) },
    perpMarkets: { path: "perp_markets", encode: (perpMarkets) => ({ perpMarkets }) },
    spotMarketScope: {
        path: "spot_market_scope",
        encode: (scope) => ({ spotMarketScope: PolicyMarketScopeCodec.inputToProto[scope] }),
    },
    perpMarketScope: {
        path: "perp_market_scope",
        encode: (scope) => ({ perpMarketScope: PolicyMarketScopeCodec.inputToProto[scope] }),
    },
    actions: {
        path: "actions",
        encode: (actions) => ({
            actions: actions.map((action) => PolicyActionCodec.inputToProto[action]),
        }),
    },
    globalExposureCap: {
        path: "global_notional_cap",
        encode: (value) => ({ globalNotionalCap: toBigIntOrZero(value) }),
    },
    maxOrderSize: {
        path: "max_order_notional",
        encode: (value) => ({ maxOrderNotional: toBigIntOrZero(value) }),
    },
    maxOpenOrders: {
        path: "max_open_orders",
        encode: (value) => ({ maxOpenOrders: toIntOrZero(value) }),
    },
    maxOpenPositions: {
        path: "max_open_positions",
        encode: (value) => ({ maxOpenPositions: toIntOrZero(value) }),
    },
    globalLeverageCap: {
        path: "global_perp_leverage_x",
        encode: (value) => ({ globalPerpLeverageX: toIntOrZero(value) }),
    },
    dailyInternalTransferLimit: {
        path: "daily_internal_transfer_out_limit",
        encode: (value) => ({ dailyInternalTransferOutLimit: toBigIntOrZero(value) }),
    },
    dailyWithdrawLimit: {
        path: "daily_withdraw_limit",
        encode: (value) => ({ dailyWithdrawLimit: toBigIntOrZero(value) }),
    },
    internalTransfersOwnOnly: {
        path: "internal_transfers_own_only",
        encode: (internalTransfersOwnOnly) => ({ internalTransfersOwnOnly }),
    },
    enforceWithdrawWhitelist: {
        path: "enforce_withdraw_whitelist",
        encode: (enforceWithdrawWhitelist) => ({ enforceWithdrawWhitelist }),
    },
    tradingHalted: {
        path: "trading_halted",
        encode: (tradingHalted) => ({ tradingHalted }),
    },
    liquidationOnly: {
        path: "liquidation_only",
        encode: (liquidationOnly) => ({ liquidationOnly }),
    },
    dailyLossLimit: {
        path: "daily_loss_limit",
        encode: (value) => ({ dailyLossLimit: toBigIntOrZero(value) }),
    },
    intradayDrawdownLimitPct: {
        path: "intraday_drawdown_limit_bps",
        encode: (value) => ({ intradayDrawdownLimitBps: toBpsOrZero(value) }),
    },
    policyLocked: { path: "locked", encode: (locked) => ({ locked }) },
    reviewAt: {
        path: "review_at",
        encode: (reviewAt) => {
            const timestamp = timestampFromMs(reviewAt);
            return timestamp === undefined ? {} : { reviewAt: timestamp };
        },
    },
    expiresAt: {
        path: "expires_at",
        encode: (expiresAt) => {
            const timestamp = timestampFromMs(expiresAt);
            return timestamp === undefined ? {} : { expiresAt: timestamp };
        },
    },
});

function hasMandatorySubaccountActions(actions: readonly string[] | undefined): boolean {
    return (
        actions === undefined ||
        (actions.includes("read-balances") && actions.includes("read-spot"))
    );
}

export const UpdateSubaccountPolicyInputSchema = v.pipe(
    v.strictObject({
        ...SubaccountPolicyPatchSchema.entries,
        policyId: v.pipe(
            v.string(),
            v.transform((v) => idToBigInt(v, "policyId")),
        ),
        expectedRevision: positiveBigintStringInputSchema("expectedRevision"),
    }),
    v.check(
        ({ actions }) => hasMandatorySubaccountActions(actions),
        "Subaccount policy actions must include read-balances and read-spot",
    ),
    v.check(
        ({ policyId: _policyId, expectedRevision: _expectedRevision, ...patch }) =>
            Object.values(patch).some((value) => value !== undefined),
        "At least one subaccount policy field must be provided",
    ),
    v.transform(({ policyId, expectedRevision, ...patch }) => {
        const { patch: policy, updateMask } = buildProtoPatch(
            patch,
            SUBACCOUNT_POLICY_PATCH_FIELDS,
        );
        return {
            policyId,
            policy,
            updateMask,
            expectedRevision,
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

export const ApplySubaccountPolicyInputSchema = v.strictObject({
    subaccountId: idInputSchema("subaccountId"),
    policyId: v.pipe(
        v.nullable(v.pipe(v.string(), v.trim())),
        v.transform((value) => (value ? idToBigInt(value, "policyId") : undefined)),
    ),
});

export type SubaccountPolicyApplyInput = v.InferInput<typeof ApplySubaccountPolicyInputSchema>;

const DEFAULT_SUBACCOUNT_POLICY_UPDATED_AT = Date.now();

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
    createdAt: DEFAULT_SUBACCOUNT_POLICY_UPDATED_AT,
    updatedAt: DEFAULT_SUBACCOUNT_POLICY_UPDATED_AT,
    updatedAtNs: (BigInt(DEFAULT_SUBACCOUNT_POLICY_UPDATED_AT) * 1_000_000n).toString(),
    isTemplate: false,
    sourceTemplateId: undefined,
    locked: false,
    reviewAt: undefined,
    expiresAt: undefined,
    intradayDrawdownLimitPct: 0,
    revision: "0",
};
