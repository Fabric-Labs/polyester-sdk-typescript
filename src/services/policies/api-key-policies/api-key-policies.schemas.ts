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
    OptionalPublicIdSchema,
    BigIntStringSchema,
    PublicIdSchema,
    TimestampMsSchema,
    TimestampSchema,
    positiveBigintStringInputSchema,
} from "../../../shared/schemas.js";
import { tsObjToMs, tsObjToNsString } from "../../../utils/time.js";
import { buildProtoPatch, defineProtoPatchFields } from "../../../utils/proto-patch.js";

const OptionalApiKeyContextSchema = v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1, "keyId is required")),
);

export const ListApiKeyPoliciesInputSchema = v.strictObject({
    keyId: OptionalApiKeyContextSchema,
});

export type ListApiKeyPoliciesInput = v.InferInput<typeof ListApiKeyPoliciesInputSchema>;

export const GetApiKeyPolicyInputSchema = v.pipe(
    v.strictObject({
        policyId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
        keyId: OptionalApiKeyContextSchema,
    }),
    v.transform(({ policyId, keyId }) => ({
        policyId: policyId ? idToBigInt(policyId, "policyId") : undefined,
        keyId,
    })),
);

export type GetApiKeyPolicyInput = v.InferInput<typeof GetApiKeyPolicyInputSchema>;

/**
 * From the backend format to a usable frontend/UI format, so big ints to numbers, etc.
 * Shape matches auth.v1.ApiPolicyView.
 */
export const ApiKeyPolicySchema = v.pipe(
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
        createdAt: TimestampMsSchema,
        updatedAt: TimestampSchema,
        revision: BigIntStringSchema,
    }),
    v.transform(({ updatedAt, ...policy }) => ({
        ...policy,
        updatedAt: tsObjToMs(updatedAt),
        updatedAtNs: tsObjToNsString(updatedAt),
    })),
);

export type ApiKeyPolicy = v.InferOutput<typeof ApiKeyPolicySchema>;

export const ListApiKeyPoliciesResponseSchema = v.pipe(
    v.object({
        policies: v.optional(v.array(ApiKeyPolicySchema), []),
    }),
    v.transform((value) => value.policies),
);

export type ListApiKeyPoliciesResponse = v.InferOutput<typeof ListApiKeyPoliciesResponseSchema>;

const ApiKeyPolicyInputBaseSchema = v.strictObject({
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
    isTemplate: v.optional(v.boolean(), false),
    assignToKeyId: v.optional(v.pipe(v.string(), v.trim())),
});

export const CreateApiKeyPolicyInputSchema = v.pipe(
    ApiKeyPolicyInputBaseSchema,
    v.transform(({ assignToKeyId, ...policy }) => ({ policy, assignToKeyId })),
);

export type ApiKeyPolicyCreateInput = v.InferInput<typeof CreateApiKeyPolicyInputSchema>;

const ApiKeyPolicyPatchSchema = v.strictObject({
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    spotMarkets: v.optional(v.array(SpotMarketRuleSchema)),
    spotMarketScope: v.optional(PolicyMarketScopeEnumSchema),
    actions: v.optional(v.array(PolicyActionEnumSchema)),
    isTemplate: v.optional(v.boolean()),
});

type ApiKeyPolicyPatch = v.InferOutput<typeof ApiKeyPolicyPatchSchema>;

const API_KEY_POLICY_PATCH_FIELDS = defineProtoPatchFields<ApiKeyPolicyPatch>()({
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
    isTemplate: { path: "is_template", encode: (isTemplate) => ({ isTemplate }) },
});

export const UpdateApiKeyPolicyInputSchema = v.pipe(
    v.strictObject({
        ...ApiKeyPolicyPatchSchema.entries,
        policyId: v.pipe(
            v.string(),
            v.transform((v) => idToBigInt(v, "policyId")),
        ),
        expectedRevision: positiveBigintStringInputSchema("expectedRevision"),
    }),
    v.check(
        ({ policyId: _policyId, expectedRevision: _expectedRevision, ...patch }) =>
            Object.values(patch).some((value) => value !== undefined),
        "At least one API key policy field must be provided",
    ),
    v.transform(({ policyId, expectedRevision, ...patch }) => {
        const { patch: policy, updateMask } = buildProtoPatch(patch, API_KEY_POLICY_PATCH_FIELDS);
        return {
            policyId,
            policy,
            updateMask,
            expectedRevision,
        };
    }),
);

export type ApiKeyPolicyUpdateInput = v.InferInput<typeof UpdateApiKeyPolicyInputSchema>;

export const ApplyApiKeyPolicyInputSchema = v.strictObject({
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
    actions: [],
    isTemplate: false,
    sourceTemplateId: "",
    createdAt: 0,
    updatedAt: 0,
    updatedAtNs: "0",
    revision: "0",
};
