import * as v from "valibot";
import { idToBigInt } from "../../utils/base58-id.js";
import { SymbolIdInputSchema } from "../shared.js";
import { POLICY_ACTION_LABELS, PRODUCT_POLICY_ACTION_LABELS } from "./shared.codecs.js";

export const SpotMarketRuleSchema = v.object({
    symbolId: SymbolIdInputSchema,
});

export const POLICY_ACTIONS = POLICY_ACTION_LABELS;

export const POLICY_MARKET_SCOPES = ["all", "allowlist"] as const;

export const ProtoPolicyActionEnumSchema = v.number();
export const PolicyActionEnumSchema = v.picklist(POLICY_ACTIONS);
/** Sub-account policies take product actions only; the server refuses account permissions. */
export const SubaccountPolicyActionEnumSchema = v.picklist(PRODUCT_POLICY_ACTION_LABELS);
export const ProtoPolicyMarketScopeEnumSchema = v.number();
export const PolicyMarketScopeEnumSchema = v.picklist(POLICY_MARKET_SCOPES);
export type PolicyMarketScope = v.InferOutput<typeof PolicyMarketScopeEnumSchema>;

export type PolicyAction = v.InferOutput<typeof PolicyActionEnumSchema>;

export const PolicyIdSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.transform((v) => idToBigInt(v, "policyId")),
);
