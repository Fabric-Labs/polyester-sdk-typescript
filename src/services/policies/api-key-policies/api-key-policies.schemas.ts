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
import { toBigIntOrZero } from "../../../utils/numbers.js";
import { formatId, idToBigInt } from "../../../utils/base58-id.js";
import { TimestampSchema } from "../../../shared/schemas.js";

const OptionalNumberDefaultNull = v.nullable(v.optional(v.number()));

/**
 * From the backend format to a usable frontend/UI format, so big ints to numbers, etc.
 */
export const ApiKeyPolicySchema = v.object({
    id: v.pipe(
        v.bigint(),
        v.transform((v) => formatId(v)),
    ),
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
    isTemplate: v.optional(v.optional(v.boolean()), false),
    sourceTemplateId: v.pipe(
        v.optional(v.bigint()),
        v.transform((v) => (v ? formatId(v) : undefined)),
    ),
    globalNotionalCap: v.pipe(
        v.optional(v.bigint()),
        v.transform((v) => (v ? Number(v) : undefined)),
    ),
    maxOrderNotional: v.pipe(
        v.optional(v.bigint()),
        v.transform((v) => (v ? Number(v) : undefined)),
    ),
    maxOpenOrders: v.optional(v.number()),
    maxOpenPositions: v.optional(v.number()),
    globalPerpLeverageX: v.optional(v.optional(v.number()), 0),
    dailyInternalTransferOutLimit: v.pipe(
        v.bigint(),
        v.transform((v) => Number(v)),
    ),
    dailyWithdrawLimit: v.pipe(
        v.bigint(),
        v.transform((v) => Number(v)),
    ),
    internalTransfersOwnOnly: v.optional(v.optional(v.boolean()), true),
    enforceWithdrawWhitelist: v.optional(v.optional(v.boolean()), false),
    tradingHalted: v.optional(v.optional(v.boolean()), false),
    liquidationOnly: v.optional(v.optional(v.boolean()), false),
    dailyLossLimit: v.pipe(
        v.optional(v.bigint()),
        v.transform((v) => (v ? Number(v) : undefined)),
    ),
    intradayDrawdownLimitBps: v.optional(v.number()),
    locked: v.optional(v.boolean(), false),
    reviewAt: v.optional(TimestampSchema),
    expiresAt: v.optional(TimestampSchema),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
});

export type ApiKeyPolicy = v.InferOutput<typeof ApiKeyPolicySchema>;

export const ListApiKeyPoliciesResponseSchema = v.pipe(
    v.object({
        policies: v.optional(v.array(ApiKeyPolicySchema), []),
    }),
    v.transform((value) => value.policies),
);

export type ListApiKeyPoliciesResponse = v.InferOutput<typeof ListApiKeyPoliciesResponseSchema>;

export const CreateApiKeyPolicyInputSchema = v.object({
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
    maxOrderNotional: v.pipe(OptionalNumberDefaultNull, v.transform(toBigIntOrZero)),
    dailyInternalTransferLimit: v.pipe(OptionalNumberDefaultNull, v.transform(toBigIntOrZero)),
    dailyWithdrawLimit: v.pipe(OptionalNumberDefaultNull, v.transform(toBigIntOrZero)),
    isTemplate: v.optional(v.optional(v.boolean()), false),
    assignToKeyId: v.optional(v.pipe(v.string(), v.trim())),
});

export type ApiKeyPolicyCreateInput = v.InferInput<typeof CreateApiKeyPolicyInputSchema>;

export const UpdateApiKeyPolicyInputSchema = v.object({
    ...v.omit(CreateApiKeyPolicyInputSchema, ["assignToKeyId"]).entries,
    policyId: v.pipe(
        v.string(),
        v.transform((v) => idToBigInt(v, "policyId")),
    ),
});

export type ApiKeyPolicyUpdateInput = v.InferInput<typeof UpdateApiKeyPolicyInputSchema>;

export const ApplyApiKeyPolicyInputSchema = v.object({
    keyId: v.pipe(v.string(), v.trim(), v.minLength(1)),
    policyId: v.pipe(
        v.nullable(v.pipe(v.string(), v.trim())),
        v.transform((value) => (value ? idToBigInt(value, "policyId") : undefined)),
    ),
});

export type ApiKeyPolicyApplyInput = v.InferInput<typeof ApplyApiKeyPolicyInputSchema>;

export const DEFAULT_API_KEY_POLICY: ApiKeyPolicy = {
    id: "",
    name: "API Key Policy",
    description: "Default API key policy with no permissions",
    spotMarkets: [],
    spotMarketScope: "all",
    perpMarketScope: "all",
    perpMarkets: [],
    actions: [],
    globalNotionalCap: 0,
    maxOrderNotional: 0,
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
    intradayDrawdownLimitBps: 0,
    locked: false,
    isTemplate: false,
    sourceTemplateId: "",
    reviewAt: undefined,
    expiresAt: undefined,
    createdAt: { seconds: 0n, nanos: 0 },
    updatedAt: { seconds: 0n, nanos: 0 },
};
