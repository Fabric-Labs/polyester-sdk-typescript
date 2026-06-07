import { z } from "zod";
import {
	PerpMarketRuleSchema,
	PolicyActionEnumSchema,
	PolicyMarketScopeEnumSchema,
	ProtoPolicyActionEnumSchema,
	ProtoPolicyMarketScopeEnumSchema,
	SpotMarketRuleSchema,
} from "../shared.js";
import { PolicyMarketScopeCodec, PolicyActionCodec } from "../shared.codecs.js";
import { toBigIntOrZero } from "../../../utils/numbers.js";
import { formatId, idToBigInt } from "../../../utils/base58-id.js";
import { TimestampSchema } from "../../../shared/schemas.js";

const OptionalNumberDefaultNull = z.number().optional().nullable();

/**
 * From the backend format to a usable frontend/UI format, so big ints to numbers, etc.
 */
export const ApiKeyPolicySchema = z.object({
	id: z.bigint().transform((v) => formatId(v)),
	name: z.string(),
	description: z.string(),
	spotMarkets: z.array(SpotMarketRuleSchema).default([]),
	spotMarketScope: ProtoPolicyMarketScopeEnumSchema.transform(
		(v) => PolicyMarketScopeCodec.protoToOutput[v]
	),
	perpMarketScope: ProtoPolicyMarketScopeEnumSchema.transform(
		(v) => PolicyMarketScopeCodec.protoToOutput[v]
	),
	perpMarkets: z.array(PerpMarketRuleSchema).default([]),
	actions: z
		.array(ProtoPolicyActionEnumSchema)
		.default([])
		.transform((v) => v.map((action) => PolicyActionCodec.protoToOutput[action])),
	isTemplate: z.boolean().optional().default(false),
	sourceTemplateId: z
		.bigint()
		.optional()
		.transform((v) => (v ? formatId(v) : undefined)),
	globalNotionalCap: z
		.bigint()
		.optional()
		.transform((v) => (v ? Number(v) : undefined)),
	maxOrderNotional: z
		.bigint()
		.optional()
		.transform((v) => (v ? Number(v) : undefined)),
	maxOpenOrders: z.number().optional(),
	maxOpenPositions: z.number().optional(),
	globalPerpLeverageX: z.number().optional().default(0),
	dailyInternalTransferOutLimit: z.bigint().transform((v) => Number(v)),
	dailyWithdrawLimit: z.bigint().transform((v) => Number(v)),
	internalTransfersOwnOnly: z.boolean().optional().default(true),
	enforceWithdrawWhitelist: z.boolean().optional().default(false),
	tradingHalted: z.boolean().optional().default(false),
	liquidationOnly: z.boolean().optional().default(false),
	dailyLossLimit: z
		.bigint()
		.optional()
		.transform((v) => (v ? Number(v) : undefined)),
	intradayDrawdownLimitBps: z.number().optional(),
	locked: z.boolean().default(false),
	reviewAt: TimestampSchema.optional(),
	expiresAt: TimestampSchema.optional(),
	createdAt: TimestampSchema,
	updatedAt: TimestampSchema,
});

export type ApiKeyPolicy = z.output<typeof ApiKeyPolicySchema>;

export const CreateApiKeyPolicyInputSchema = z.object({
	name: z.string(),
	description: z.string().optional().default(""),
	spotMarkets: z.array(SpotMarketRuleSchema).optional().default([]),
	perpMarkets: z.array(PerpMarketRuleSchema).optional().default([]),
	spotMarketScope: PolicyMarketScopeEnumSchema.transform(
		(v) => PolicyMarketScopeCodec.inputToProto[v]
	),
	perpMarketScope: PolicyMarketScopeEnumSchema.transform(
		(v) => PolicyMarketScopeCodec.inputToProto[v]
	),
	actions: z
		.array(PolicyActionEnumSchema)
		.optional()
		.default([])
		.transform((v) => v.map((action) => PolicyActionCodec.outputToProto[action])),
	maxOrderNotional: OptionalNumberDefaultNull.transform(toBigIntOrZero),
	dailyInternalTransferLimit: OptionalNumberDefaultNull.transform(toBigIntOrZero),
	dailyWithdrawLimit: OptionalNumberDefaultNull.transform(toBigIntOrZero),
	isTemplate: z.boolean().optional().default(false),
	assignToKeyId: z.string().trim().optional(),
});

export type ApiKeyPolicyCreateInput = z.input<typeof CreateApiKeyPolicyInputSchema>;

export const UpdateApiKeyPolicyInputSchema = CreateApiKeyPolicyInputSchema.omit({
	assignToKeyId: true,
}).extend({
	policyId: z.string().transform((v) => idToBigInt(v, "policyId")),
});

export type ApiKeyPolicyUpdateInput = z.input<typeof UpdateApiKeyPolicyInputSchema>;

export const ApplyApiKeyPolicyInputSchema = z.object({
	keyId: z.string({ error: "keyId is required" }).trim().min(1),
	policyId: z
		.string()
		.trim()
		.nullable()
		.transform((value) => (value ? idToBigInt(value, "policyId") : undefined)),
});

export type ApiKeyPolicyApplyInput = z.input<typeof ApplyApiKeyPolicyInputSchema>;

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
