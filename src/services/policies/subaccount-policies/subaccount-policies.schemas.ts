import * as v from "valibot";
import {
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
import { idToBigInt } from "../../../utils/base58-id.js";
import {
    OptionalNumberToBigIntOrZeroSchema,
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
import { toBigIntOrZero, toIntOrZero } from "../../../utils/numbers.js";
import { PROTOBUF_UINT32_MAX } from "../../../shared/wire-bounds.js";
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
        actions: v.pipe(
            v.optional(v.array(ProtoPolicyActionEnumSchema), []),
            v.transform((v) => v.map((action) => policyActionLabelFor(action))),
        ),
        isTemplate: v.optional(v.boolean(), false),
        sourceTemplateId: OptionalPublicIdSchema,
        maxOrderNotional: v.pipe(
            v.bigint(),
            v.transform((v) => Number(v)),
        ),
        maxOpenOrders: v.number(),
        tradingHalted: v.boolean(),
        locked: v.boolean(),
        reviewAt: OptionalTimestampMsSchema,
        expiresAt: OptionalTimestampMsSchema,
        createdAt: TimestampMsSchema,
        updatedAt: TimestampSchema,
        revision: BigIntStringSchema,
    }),
    v.transform(({ maxOrderNotional, updatedAt, ...rest }) => ({
        maxOrderSize: maxOrderNotional,
        ...rest,
        updatedAt: tsObjToMs(updatedAt),
        updatedAtNs: tsObjToNsString(updatedAt),
    })),
);

export type SubaccountPolicy = v.InferOutput<typeof SubaccountPolicySchema>;

const SubaccountPolicyInputBaseSchema = v.strictObject({
    name: v.string(),
    description: v.optional(v.string(), ""),
    spotMarkets: v.optional(v.array(SpotMarketRuleSchema), []),
    spotMarketScope: v.pipe(
        PolicyMarketScopeEnumSchema,
        v.transform((v) => PolicyMarketScopeCodec.inputToProto[v]),
    ),
    actions: v.pipe(
        v.optional(v.array(PolicyActionEnumSchema), []),
        v.transform((v) => (v ?? []).map((action) => PolicyActionCodec.inputToProto[action])),
    ),
    maxOrderSize: OptionalNumberToBigIntOrZeroSchema,
    maxOpenOrders: OptionalNumberToIntOrZeroSchema,
    tradingHalted: v.optional(v.boolean(), false),
    policyLocked: v.optional(v.boolean(), false),
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
        maxOrderSize,
        policyLocked,
        ...rest
    } = input;
    return {
        ...rest,
        maxOrderNotional: maxOrderSize,
        locked: policyLocked,
        reviewAt: timestampFromMs(reviewAt),
        expiresAt: timestampFromMs(expiresAt),
    };
}

export const CreateSubaccountPolicyInputSchema = v.pipe(
    SubaccountPolicyInputBaseSchema,
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
    spotMarketScope: v.optional(PolicyMarketScopeEnumSchema),
    actions: v.optional(v.array(PolicyActionEnumSchema)),
    maxOrderSize: v.optional(v.nullable(v.number())),
    maxOpenOrders: v.optional(v.nullable(v.pipe(v.number(), v.maxValue(PROTOBUF_UINT32_MAX)))),
    tradingHalted: v.optional(v.boolean()),
    policyLocked: v.optional(v.boolean()),
    reviewAt: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
    expiresAt: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
});

type SubaccountPolicyPatch = v.InferOutput<typeof SubaccountPolicyPatchSchema>;

const SUBACCOUNT_POLICY_PATCH_FIELDS = defineProtoPatchFields<SubaccountPolicyPatch>()({
    name: { path: "name", encode: (name) => ({ name }) },
    description: { path: "description", encode: (description) => ({ description }) },
    spotMarkets: { path: "spot_markets", encode: (spotMarkets) => ({ spotMarkets }) },
    spotMarketScope: {
        path: "spot_market_scope",
        encode: (scope) => ({ spotMarketScope: PolicyMarketScopeCodec.inputToProto[scope] }),
    },
    actions: {
        path: "actions",
        encode: (actions) => ({
            actions: actions.map((action) => PolicyActionCodec.inputToProto[action]),
        }),
    },
    maxOrderSize: {
        path: "max_order_notional",
        encode: (value) => ({ maxOrderNotional: toBigIntOrZero(value) }),
    },
    maxOpenOrders: {
        path: "max_open_orders",
        encode: (value) => ({ maxOpenOrders: toIntOrZero(value) }),
    },
    tradingHalted: {
        path: "trading_halted",
        encode: (tradingHalted) => ({ tradingHalted }),
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
    spotMarketScope: "all",
    actions: ["read-balances", "read-internal-transfers", "read-address-book", "read-spot"],
    maxOrderSize: 0,
    maxOpenOrders: 0,
    tradingHalted: false,
    createdAt: DEFAULT_SUBACCOUNT_POLICY_UPDATED_AT,
    updatedAt: DEFAULT_SUBACCOUNT_POLICY_UPDATED_AT,
    updatedAtNs: (BigInt(DEFAULT_SUBACCOUNT_POLICY_UPDATED_AT) * 1_000_000n).toString(),
    isTemplate: false,
    sourceTemplateId: undefined,
    locked: false,
    reviewAt: undefined,
    expiresAt: undefined,
    revision: "0",
};
