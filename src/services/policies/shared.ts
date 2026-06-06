import { z } from "zod";
import * as Proto from "../../gen/auth/v1/policies_pb";
import { idToBigInt } from "../../utils/base58-id";

export const SpotMarketRuleSchema = z.object({
	symbol: z.string(),
});

export const PerpMarketRuleSchema = z.object({
	symbol: z.string(),
	maxLeverageX: z.number(),
});

export const POLICY_ACTIONS = [
	"trade-spot",
	"trade-perp",
	"internal-transfer",
	"external-withdraw",
	"read-balances",
	"read-spot",
	"read-perp",
	"read-internal-transfers",
	"read-external-withdrawals",
	"read-transfer-controls",
	"manage-address-book",
	"manage-transfer-whitelists",
] as const;

export const POLICY_MARKET_SCOPES = ["all", "allowlist"] as const;

export const ProtoPolicyActionEnumSchema = z.enum(Proto.PolicyAction);
export const PolicyActionEnumSchema = z.enum(POLICY_ACTIONS);
export const ProtoPolicyMarketScopeEnumSchema = z.enum(Proto.MarketScope_Value);
export const PolicyMarketScopeEnumSchema = z.enum(POLICY_MARKET_SCOPES);
export type PolicyMarketScope = z.output<typeof PolicyMarketScopeEnumSchema>;

export type PolicyAction = z.output<typeof PolicyActionEnumSchema>;

export const PolicyIdSchema = z
	.string({ error: "policyId is required" })
	.trim()
	.min(1)
	.transform((v) => idToBigInt(v, "policyId"));
