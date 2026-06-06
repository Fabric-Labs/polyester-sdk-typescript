import { z } from "zod";
import {
	PerpMarketRuleSchema,
	PolicyActionEnumSchema,
	PolicyMarketScopeEnumSchema,
	ProtoPolicyActionEnumSchema,
	ProtoPolicyMarketScopeEnumSchema,
	SpotMarketRuleSchema,
} from "../shared";
import { PolicyMarketScopeCodec, PolicyActionCodec } from "../shared.codecs";
import { bpsToPct, toBigIntOrZero, toBpsOrZero, toIntOrZero } from "../../../utils/numbers";
import { formatId, idToBigInt } from "../../../utils/base58-id";
import { TimestampSchema } from "../../../shared/schemas";
import { tsObjToMs } from "../../../utils/time";

const OptionalNumberDefaultNull = z.number().optional().nullable();

/**
 * From the backend format to a usable frontend/UI format, so big ints to numbers, etc.
 */
export const SubAccountPolicySchema = z
	.object({
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
		sourceTemplateId: z.bigint().transform((v) => (v ? formatId(v) : undefined)),
		globalNotionalCap: z.bigint().transform((v) => Number(v)),
		maxOrderNotional: z.bigint().transform((v) => Number(v)),
		maxOpenOrders: z.number(),
		maxOpenPositions: z.number(),
		globalPerpLeverageX: z.number(),
		dailyInternalTransferOutLimit: z.bigint().transform((v) => Number(v)),
		dailyWithdrawLimit: z.bigint().transform((v) => Number(v)),
		internalTransfersOwnOnly: z.boolean(),
		enforceWithdrawWhitelist: z.boolean(),
		tradingHalted: z.boolean(),
		liquidationOnly: z.boolean(),
		dailyLossLimit: z.bigint().transform((v) => Number(v)),
		intradayDrawdownLimitBps: z.number().transform(bpsToPct),
		locked: z.boolean(),
		reviewAt: TimestampSchema.optional().transform((v) => {
			if (v === undefined) return undefined;
			if (v === null) return 0;
			return tsObjToMs(v);
		}),
		expiresAt: TimestampSchema.optional().transform((v) => {
			if (v === undefined) return undefined;
			if (v === null) return 0;
			return tsObjToMs(v);
		}),
		createdAt: TimestampSchema.transform((v) => tsObjToMs(v)),
		updatedAt: TimestampSchema.transform((v) => tsObjToMs(v)),
	})
	.transform(({ maxOrderNotional, globalNotionalCap, intradayDrawdownLimitBps, ...rest }) => ({
		maxOrderSize: maxOrderNotional,
		globalExposureCap: globalNotionalCap,
		intradayDrawdownLimitPct: intradayDrawdownLimitBps,
		...rest,
	}));

export type SubAccountPolicy = z.output<typeof SubAccountPolicySchema>;

const SubAccountPolicyInputBaseSchema = z.object({
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
	globalLeverageCap: OptionalNumberDefaultNull.transform(toIntOrZero),
	globalExposureCap: OptionalNumberDefaultNull.transform(toBigIntOrZero),
	maxOrderSize: OptionalNumberDefaultNull.transform(toBigIntOrZero),
	maxOpenOrders: OptionalNumberDefaultNull.transform(toIntOrZero),
	maxOpenPositions: OptionalNumberDefaultNull.transform(toIntOrZero),
	dailyInternalTransferLimit: OptionalNumberDefaultNull.transform(toBigIntOrZero),
	dailyWithdrawLimit: OptionalNumberDefaultNull.transform(toBigIntOrZero),
	dailyLossLimit: OptionalNumberDefaultNull.transform(toBigIntOrZero),
	intradayDrawdownLimitPct: OptionalNumberDefaultNull.transform(toBpsOrZero),
	tradingHalted: z.boolean().optional().default(false),
	liquidationOnly: z.boolean().optional().default(false),
	policyLocked: z.boolean().optional().default(false),
	internalTransfersOwnOnly: z.boolean().optional().default(true),
	enforceWithdrawWhitelist: z.boolean().optional().default(false),
	subAccountId: z
		.string()
		.optional()
		.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
});

function createSubaccountPolicyBaseTransform(
	input: z.output<typeof SubAccountPolicyInputBaseSchema>
) {
	return {
		...input,
		globalNotionalCap: input.globalExposureCap,
		maxOrderNotional: input.maxOrderSize,
		globalPerpLeverageX: input.globalLeverageCap,
		dailyInternalTransferOutLimit: input.dailyInternalTransferLimit,
		intradayDrawdownLimitBps: input.intradayDrawdownLimitPct,
		locked: input.policyLocked,
		subaccountId: input.subAccountId,
	};
}

export const CreateSubAccountPolicyInputSchema = SubAccountPolicyInputBaseSchema.transform(
	createSubaccountPolicyBaseTransform
);
export type SubAccountPolicyCreateInput = z.input<typeof CreateSubAccountPolicyInputSchema>;

export const UpdateSubAccountPolicyInputSchema = SubAccountPolicyInputBaseSchema.extend({
	policyId: z.string().transform((v) => idToBigInt(v, "policyId")),
}).transform(({ policyId, ...rest }) => {
	return {
		...createSubaccountPolicyBaseTransform(rest),
		policyId,
	};
});
export type SubAccountPolicyUpdateInput = z.input<typeof UpdateSubAccountPolicyInputSchema>;

export const PolicyIdSchema = z
	.string({ error: "policyId is required" })
	.trim()
	.min(1)
	.transform((v) => idToBigInt(v, "policyId"));

export const ApplySubAccountPolicyInputSchema = z
	.object({
		subAccountId: z
			.string({ error: "subaccountId is required" })
			.trim()
			.min(1)
			.transform((v) => idToBigInt(v, "subaccountId")),
		policyId: z
			.string()
			.trim()
			.nullable()
			.transform((value) => (value ? idToBigInt(value, "policyId") : undefined)),
	})
	.transform(({ subAccountId, policyId }) => ({
		subaccountId: subAccountId,
		policyId,
	}));

export type SubAccountPolicyApplyInput = z.input<typeof ApplySubAccountPolicyInputSchema>;

export const DEFAULT_SUBACCOUNT_POLICY: SubAccountPolicy = {
	id: "",
	name: "Sub-Account Policy",
	description: "Sub-Account Policy description",
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
