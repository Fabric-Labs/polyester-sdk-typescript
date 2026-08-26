import * as v from "valibot";
import * as Proto from "../../gen/auth/v1/policies_pb.js";
import { idToBigInt } from "../../utils/base58-id.js";

export const SpotMarketRuleSchema = v.object({
    symbol: v.string(),
});

export const POLICY_ACTIONS = [
    "trade-spot",
    "internal-transfer",
    "external-withdraw",
    "read-balances",
    "read-spot",
    "read-internal-transfers",
    "read-address-book",
    "manage-address-book",
] as const;

export const POLICY_MARKET_SCOPES = ["all", "allowlist"] as const;

export const ProtoPolicyActionEnumSchema = v.enum(Proto.PolicyAction);
export const PolicyActionEnumSchema = v.picklist(POLICY_ACTIONS);
export const ProtoPolicyMarketScopeEnumSchema = v.enum(Proto.MarketScope_Value);
export const PolicyMarketScopeEnumSchema = v.picklist(POLICY_MARKET_SCOPES);
export type PolicyMarketScope = v.InferOutput<typeof PolicyMarketScopeEnumSchema>;

export type PolicyAction = v.InferOutput<typeof PolicyActionEnumSchema>;

export const PolicyIdSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.transform((v) => idToBigInt(v, "policyId")),
);
