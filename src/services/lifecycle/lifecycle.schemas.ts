import { z } from "zod";
import * as Proto from "../../gen/chain/lifecycle/v1/types_pb.js";
import * as ProtoRead from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import {
	LIFECYCLE_FLOW_KIND_VALUES,
	LIFECYCLE_FLOW_STATE_VALUES,
	LIFECYCLE_LIST_SCOPE_VALUES,
	LIFECYCLE_TX_LOOKUP_KIND_VALUES,
	LifecycleFlowDomainCodec,
	LifecycleFlowKindCodec,
	LifecycleFlowStateCodec,
	LifecycleFlowStepActivityKindCodec,
	LifecycleFlowStepCodec,
	LifecycleFlowTimelineStatusCodec,
	LifecycleListScopeCodec,
	LifecycleRequestFeeStatusCodec,
	LifecycleSourceCodec,
	LifecycleTxLookupKindCodec,
	type LifecycleListScopeOutputValue,
	type LifecycleRequestFeeStatusValue,
	type LifecycleTxLookupKindOutputValue,
} from "./lifecycle.codecs.js";
import { formatId, idToBigInt } from "../../utils/base58-id.js";
import { fromU128, u128ToDecimal } from "../../utils/u128.js";
import { assetForId } from "../../catalogs/ledger-catalog.js";

const FlowKindSchema = z.enum(LIFECYCLE_FLOW_KIND_VALUES);
const FlowStateSchema = z.enum(LIFECYCLE_FLOW_STATE_VALUES);
const ListScopeSchema = z.enum(LIFECYCLE_LIST_SCOPE_VALUES);
const TxLookupKindSchema = z.enum(LIFECYCLE_TX_LOOKUP_KIND_VALUES);

const canonicalTxHashPattern = /^0x[0-9a-fA-F]{64}$/;
const smartAccountAddressPattern = /^0x[0-9a-fA-F]{40}$/;
const maxUint32 = 4_294_967_295;

const RequiredTxHashSchema = z
	.string()
	.trim()
	.min(1, "txHash is required.")
	.regex(canonicalTxHashPattern, "txHash must be a canonical EVM tx hash.");

const OptionalOwnerAccountIdSchema = z
	.string()
	.trim()
	.optional()
	.transform((v) => {
		if (!v) return undefined;
		const isSmartAccountAddress = smartAccountAddressPattern.test(v);
		if (isSmartAccountAddress) return { case: "smartAccountAddress" as const, value: v };
		return { case: "ownerAccountId" as const, value: idToBigInt(v, "ownerAccountId") };
	});
const OptionalAccountIdSchema = z
	.string()
	.trim()
	.optional()
	.transform((v) => {
		if (!v) return undefined;
		return { case: "ownerAccountId" as const, value: idToBigInt(v, "accountId") };
	});
const OptionalSmartAccountAddressSchema = z
	.string()
	.trim()
	.regex(smartAccountAddressPattern, "smartAccountAddress must be a canonical 0x address.")
	.optional();

const Uint32Schema = z.number().int().positive().max(maxUint32);

const LifecycleU128RawSchema = z.object({
	hi: z.bigint(),
	lo: z.bigint(),
});

const LifecycleAmountE18Schema = LifecycleU128RawSchema.transform((v) =>
	u128ToDecimal(fromU128(v), 18)
);

const LifecycleU256Schema = z.object({
	be: z.instanceof(Uint8Array),
});

const LifecycleAssetIdsSchema = z.object({
	chainAssetId: z.number().int().nonnegative(),
	unifiedAssetId: z.number().int().nonnegative(),
});

const LifecycleFlowStepEnumSchema = z
	.enum(ProtoRead.FlowStep)
	.transform((v) => LifecycleFlowStepCodec.protoToOutput[v]);
const LifecycleSourceEnumSchema = z
	.enum(Proto.LifecycleSource)
	.transform((v) => LifecycleSourceCodec.protoToOutput[v]);
const LifecycleFlowKindEnumSchema = z
	.enum(Proto.FlowKind)
	.transform((v) => LifecycleFlowKindCodec.protoToOutput[v]);

const LifecycleFlowDomainEnumSchema = z
	.enum(Proto.FlowDomain)
	.optional()
	.transform((v) =>
		v === undefined ? "unspecified" : LifecycleFlowDomainCodec.protoToOutput[v]
	);
const LifecycleFlowStateEnumSchema = z
	.enum(Proto.FlowState)
	.transform((v) => LifecycleFlowStateCodec.protoToOutput[v]);
const LifecycleFlowStepActivityKindEnumSchema = z
	.enum(ProtoRead.FlowStepActivityKind)
	.transform((v) => LifecycleFlowStepActivityKindCodec.protoToOutput[v]);
const LifecycleFlowTimelineStatusEnumSchema = z
	.enum(ProtoRead.FlowTimelineStatus)
	.transform((v) => LifecycleFlowTimelineStatusCodec.protoToOutput[v]);
const LifecycleRequestFeeStatusEnumSchema = z
	.enum(Proto.RequestFeeStatus)
	.transform((v) => LifecycleRequestFeeStatusCodec.protoToOutput[v]);
const LifecycleIdSchema = z.bigint().transform((v) => formatId(v));
const LifecycleMsSchema = z.bigint().transform((v) => Number(v));
const LifecycleTxOccurrenceIndexSchema = z
	.bigint()
	.optional()
	.transform((v) => Number(v ?? 0n));
const LifecycleReasonHashSchema = z.string().default("");
const LifecycleLedgerTransferIdSchema = z.string().default("");

export const ListLifecycleFlowsInputSchema = z
	.object({
		limit: z.number().int().positive().max(500).optional().default(100),
		reversed: z.boolean().optional().default(true),
		flowKind: FlowKindSchema.optional().transform((v) =>
			v ? LifecycleFlowKindCodec.inputToProto[v] : Proto.FlowKind.KIND_UNSPECIFIED
		),
		flowState: FlowStateSchema.optional().transform((v) =>
			v ? LifecycleFlowStateCodec.inputToProto[v] : Proto.FlowState.STATE_UNSPECIFIED
		),
		txRef: z
			.string()
			.trim()
			.min(1)
			.regex(canonicalTxHashPattern, "txHash must be a canonical EVM tx hash.")
			.optional(),
		scope: ListScopeSchema.optional()
			.default("all")
			.transform((v) => LifecycleListScopeCodec.inputToProto[v]),
		accountId: OptionalAccountIdSchema,
		ownerAccountId: OptionalOwnerAccountIdSchema,
		smartAccountAddress: OptionalSmartAccountAddressSchema,
		polyesterChainIds: z.array(Uint32Schema).optional(),
		zippedAssetIds: z.array(Uint32Schema).optional(),
		unifiedAssetIds: z.array(Uint32Schema).optional(),
		pageToken: z.string().trim().optional().default(""),
	})
	.transform((value) => {
		const accountSelector =
			value.accountId ??
			value.ownerAccountId ??
			(value.smartAccountAddress
				? {
						case: "smartAccountAddress" as const,
						value: value.smartAccountAddress,
					}
				: undefined);
		return {
			limit: value.limit,
			reversed: value.reversed,
			flowKind: value.flowKind,
			flowState: value.flowState,
			txRef: value.txRef,
			scope: value.scope,
			accountSelector,
			polyesterChainIds: value.polyesterChainIds,
			zippedAssetIds: value.zippedAssetIds,
			unifiedAssetIds: value.unifiedAssetIds,
			pageToken: value.pageToken,
		};
	});

export const LifecycleRequestFeeSchema = z
	.object({
		assetIds: LifecycleAssetIdsSchema.optional(),
		amountE18: LifecycleAmountE18Schema.optional(),
		recipientAddress: z.string(),
		status: LifecycleRequestFeeStatusEnumSchema,
	})
	.transform((v) => {
		return {
			...v,
			unifiedAsset: v.assetIds ? assetForId(v.assetIds.unifiedAssetId) : undefined,
		};
	});

export const GetLifecycleFlowInputSchema = z
	.object({
		flowId: z.string().trim().min(1, "flowId is required."),
	})
	.transform((value) => ({
		flowId: value.flowId,
	}));

export const ListLifecycleFlowsByTxInputSchema = z.object({
	txHash: RequiredTxHashSchema,
	lookupKind: TxLookupKindSchema.transform((v) => LifecycleTxLookupKindCodec.inputToProto[v]),
	limit: z.number().int().positive().max(500).optional().default(100),
	pageToken: z.string().trim().optional().default(""),
});

export const LifecycleFlowStepActivitySchema = z.object({
	sequence: z.number().int().nonnegative(),
	txRef: z.string(),
	occurredAtUnixMs: LifecycleMsSchema,
	lifecycleSource: LifecycleSourceEnumSchema,
	reasonCode: z.number().int().nonnegative(),
	reasonHash: LifecycleReasonHashSchema,
	currentConfirmations: z.number().int().nonnegative(),
	requiredConfirmations: z.number().int().nonnegative(),
	approveCount: z.number().int().nonnegative(),
	rejectCount: z.number().int().nonnegative(),
	validatorCount: z.number().int().nonnegative(),
	kind: LifecycleFlowStepActivityKindEnumSchema,
	requiredApprovals: z.number().int().nonnegative(),
	requiredRejections: z.number().int().nonnegative(),
	amountE18: LifecycleAmountE18Schema.optional(),
	ledgerTransferId: LifecycleLedgerTransferIdSchema,
});

export const LifecycleFlowStepSchema = z
	.object({
		sequence: z.number().int().nonnegative(),
		step: LifecycleFlowStepEnumSchema,
		assetIds: LifecycleAssetIdsSchema.optional(),
		polyesterChainId: z.number().int().nonnegative(),
		amountE18: LifecycleAmountE18Schema.optional(),
		requestFee: LifecycleRequestFeeSchema.optional(),
		milestoneTxRef: z.string(),
		lifecycleSource: LifecycleSourceEnumSchema,
		reasonCode: z.number().int().nonnegative(),
		reasonHash: LifecycleReasonHashSchema,
		currentConfirmations: z.number().int().nonnegative(),
		requiredConfirmations: z.number().int().nonnegative(),
		approveCount: z.number().int().nonnegative(),
		rejectCount: z.number().int().nonnegative(),
		validatorCount: z.number().int().nonnegative(),
		requiredApprovals: z.number().int().nonnegative(),
		requiredRejections: z.number().int().nonnegative(),
		occurredAtUnixMs: LifecycleMsSchema,
		blockTimeMovingAverageMs: LifecycleMsSchema,
		activities: z.array(LifecycleFlowStepActivitySchema).default([]),
	})
	.transform((v) => {
		return {
			...v,
			unifiedAsset: v.assetIds ? assetForId(v.assetIds.unifiedAssetId) : undefined,
		};
	});

export const LifecycleFlowTimelineItemSchema = z.object({
	sequence: z.number().int().nonnegative(),
	step: LifecycleFlowStepEnumSchema,
	status: LifecycleFlowTimelineStatusEnumSchema,
	expectedDurationMs: LifecycleMsSchema,
});

export const LifecycleFlowSummaryProgressSchema = z.object({
	currentStepStartedAtUnixMs: LifecycleMsSchema,
	currentStepExpectedDurationMs: LifecycleMsSchema,
	currentConfirmations: z.number().int().nonnegative(),
	requiredConfirmations: z.number().int().nonnegative(),
	approveCount: z.number().int().nonnegative(),
	rejectCount: z.number().int().nonnegative(),
	validatorCount: z.number().int().nonnegative(),
	requiredApprovals: z.number().int().nonnegative(),
	requiredRejections: z.number().int().nonnegative(),
});

export const LifecycleFlowSummarySchema = z
	.object({
		ownerAccountId: LifecycleIdSchema,
		flowId: z.string(),
		flowKind: LifecycleFlowKindEnumSchema,
		latestStep: LifecycleFlowStepEnumSchema,
		assetIds: LifecycleAssetIdsSchema.optional(),
		polyesterChainId: z.number().int().nonnegative(),
		amountE18: LifecycleAmountE18Schema.optional(),
		requestFee: LifecycleRequestFeeSchema.optional(),
		sourceTxHash: z.string(),
		txOccurrenceIndex: LifecycleTxOccurrenceIndexSchema,
		sourceAddress: z.string(),
		destinationAddress: z.string(),
		sourceDomain: LifecycleFlowDomainEnumSchema,
		destinationDomain: LifecycleFlowDomainEnumSchema,
		latestTxRef: z.string(),
		latestLifecycleSource: LifecycleSourceEnumSchema,
		reasonCode: z.number().int().nonnegative(),
		reasonHash: LifecycleReasonHashSchema,
		startedAtUnixMs: LifecycleMsSchema,
		updatedAtUnixMs: LifecycleMsSchema,
		terminalAtUnixMs: LifecycleMsSchema,
		lastActivityAtUnixMs: LifecycleMsSchema,
		isOpen: z.boolean(),
		isTerminal: z.boolean(),
		latestStepSequence: z.number().int().nonnegative(),
		currentProgress: LifecycleFlowSummaryProgressSchema.optional(),
		summaryTimeline: z.array(LifecycleFlowTimelineItemSchema).default([]),
		estimatedCompletionUnixMs: LifecycleMsSchema,
	})
	.transform((v) => {
		return {
			...v,
			unifiedAsset: v.assetIds ? assetForId(v.assetIds.unifiedAssetId) : undefined,
		};
	});

export const LifecycleFlowDetailSchema = z.object({
	summary: LifecycleFlowSummarySchema.optional(),
	steps: z.array(LifecycleFlowStepSchema).default([]),
	fromLiveState: z.boolean(),
	timeline: z.array(LifecycleFlowTimelineItemSchema).default([]),
});

export const ListLifecycleFlowsOutputSchema = z.object({
	flows: z.array(LifecycleFlowSummarySchema).default([]),
	nextPageToken: z.string().default(""),
});

export const GetLifecycleFlowOutputSchema = z.object({
	flow: LifecycleFlowDetailSchema.optional(),
});

export const LifecycleFlowTxMatchSchema = z
	.object({
		flowId: z.string(),
		flowKind: LifecycleFlowKindEnumSchema,
		sourceTxHash: z.string(),
		latestTxRef: z.string(),
		txOccurrenceIndex: LifecycleTxOccurrenceIndexSchema,
		sourceDomain: LifecycleFlowDomainEnumSchema,
		destinationDomain: LifecycleFlowDomainEnumSchema,
		latestStep: LifecycleFlowStepEnumSchema,
		isOpen: z.boolean(),
		isTerminal: z.boolean(),
		assetIds: LifecycleAssetIdsSchema.optional(),
		polyesterChainId: z.number().int().nonnegative(),
		amountE18: LifecycleAmountE18Schema.optional(),
		sourceAddress: z.string(),
		destinationAddress: z.string(),
		reasonCode: z.number().int().nonnegative(),
		lastActivityAtUnixMs: LifecycleMsSchema,
	})
	.transform((v) => {
		return {
			...v,
			unifiedAsset: v.assetIds ? assetForId(v.assetIds.unifiedAssetId) : undefined,
		};
	});

export const ListLifecycleFlowsByTxOutputSchema = z.object({
	txHash: z.string(),
	matches: z.array(LifecycleFlowTxMatchSchema).default([]),
	nextPageToken: z.string().default(""),
});

export type ListLifecycleFlowsInput = z.input<typeof ListLifecycleFlowsInputSchema>;
export type ParsedListLifecycleFlowsInput = z.output<typeof ListLifecycleFlowsInputSchema>;

export type GetLifecycleFlowInput = z.input<typeof GetLifecycleFlowInputSchema>;
export type ParsedGetLifecycleFlowInput = z.output<typeof GetLifecycleFlowInputSchema>;

export type ListLifecycleFlowsByTxInput = z.input<typeof ListLifecycleFlowsByTxInputSchema>;
export type ParsedListLifecycleFlowsByTxInput = z.output<typeof ListLifecycleFlowsByTxInputSchema>;

export type LifecycleFlowSummary = z.output<typeof LifecycleFlowSummarySchema>;
export type LifecycleFlowStep = z.output<typeof LifecycleFlowStepSchema>;
export type LifecycleFlowStepActivity = z.output<typeof LifecycleFlowStepActivitySchema>;
export type LifecycleFlowTimelineItem = z.output<typeof LifecycleFlowTimelineItemSchema>;
export type LifecycleFlowDetail = z.output<typeof LifecycleFlowDetailSchema>;

export type ListLifecycleFlowsOutput = z.output<typeof ListLifecycleFlowsOutputSchema>;
export type GetLifecycleFlowOutput = z.output<typeof GetLifecycleFlowOutputSchema>;
export type ListLifecycleFlowsByTxOutput = z.output<typeof ListLifecycleFlowsByTxOutputSchema>;

export type LifecycleAssetIds = z.output<typeof LifecycleAssetIdsSchema>;
export type LifecycleU256 = z.output<typeof LifecycleU256Schema>;
export type LifecycleRequestFee = z.output<typeof LifecycleRequestFeeSchema>;

export type LifecycleFlowSummaryProgress = z.output<typeof LifecycleFlowSummaryProgressSchema>;
export type LifecycleFlowState = z.output<typeof LifecycleFlowStateEnumSchema>;
export type LifecycleListScope = LifecycleListScopeOutputValue;
export type LifecycleTxLookupKind = LifecycleTxLookupKindOutputValue;
export type LifecycleRequestFeeStatus = LifecycleRequestFeeStatusValue;

export type LifecycleFlowTxMatch = z.output<typeof LifecycleFlowTxMatchSchema>;
