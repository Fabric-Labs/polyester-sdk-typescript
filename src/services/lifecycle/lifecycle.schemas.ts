import * as v from "valibot";
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
    type LifecycleListScopeValue,
    type LifecycleRequestFeeStatusValue,
    type LifecycleTxLookupKindValue,
} from "./lifecycle.codecs.js";
import { formatId, idToBigInt } from "../../utils/base58-id.js";
import { fromU128, u128ToDecimal } from "../../utils/u128.js";
import { assetForId } from "../../catalogs/ledger-catalog.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";

const FlowKindSchema = v.picklist(LIFECYCLE_FLOW_KIND_VALUES);
const FlowStateSchema = v.picklist(LIFECYCLE_FLOW_STATE_VALUES);

const canonicalTxHashPattern = /^0x[0-9a-fA-F]{64}$/;
const smartAccountAddressPattern = /^0x[0-9a-fA-F]{40}$/;
const maxUint32 = 4_294_967_295;

const RequiredTxHashSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "txHash is required."),
    v.regex(canonicalTxHashPattern, "txHash must be a canonical EVM tx hash."),
);

const OptionalOwnerAccountIdSchema = v.pipe(
    v.optional(v.pipe(v.string(), v.trim())),
    v.transform((v) => {
        if (!v) return undefined;
        const isSmartAccountAddress = smartAccountAddressPattern.test(v);
        if (isSmartAccountAddress) return { case: "smartAccountAddress" as const, value: v };
        return { case: "ownerAccountId" as const, value: idToBigInt(v, "ownerAccountId") };
    }),
);
const OptionalAccountIdSchema = v.pipe(
    v.optional(v.pipe(v.string(), v.trim())),
    v.transform((v) => {
        if (!v) return undefined;
        return { case: "ownerAccountId" as const, value: idToBigInt(v, "accountId") };
    }),
);
const OptionalSmartAccountAddressSchema = v.optional(
    v.pipe(
        v.string(),
        v.trim(),
        v.regex(smartAccountAddressPattern, "smartAccountAddress must be a canonical 0x address."),
    ),
);

const Uint32Schema = v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(maxUint32));

const LifecycleU128RawSchema = v.object({
    hi: v.bigint(),
    lo: v.bigint(),
});

const LifecycleAmountE18Schema = v.pipe(
    LifecycleU128RawSchema,
    v.transform((v) => u128ToDecimal(fromU128(v), 18)),
);

const LifecycleAssetIdsSchema = v.object({
    chainAssetId: v.pipe(v.number(), v.integer(), v.minValue(0)),
    unifiedAssetId: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const LifecycleFlowStepEnumSchema = v.pipe(
    v.enum(ProtoRead.FlowStep),
    v.transform((v) =>
        requiredEnumLabel(
            LifecycleFlowStepCodec.protoToOutput,
            v,
            "LifecycleFlowStepSchema",
            "step",
        ),
    ),
);
const LifecycleSourceEnumSchema = v.pipe(
    v.enum(Proto.LifecycleSource),
    v.transform((v) =>
        requiredEnumLabel(LifecycleSourceCodec.protoToOutput, v, "LifecycleSourceSchema", "source"),
    ),
);
const LifecycleFlowKindEnumSchema = v.pipe(
    v.enum(Proto.FlowKind),
    v.transform((v) =>
        requiredEnumLabel(
            LifecycleFlowKindCodec.protoToOutput,
            v,
            "LifecycleFlowKindSchema",
            "flow kind",
        ),
    ),
);

const LifecycleFlowDomainEnumSchema = v.pipe(
    v.enum(Proto.FlowDomain),
    v.transform((v) =>
        requiredEnumLabel(
            LifecycleFlowDomainCodec.protoToOutput,
            v,
            "LifecycleFlowDomainSchema",
            "flow domain",
        ),
    ),
);
const LifecycleFlowStateEnumSchema = v.pipe(
    v.enum(Proto.FlowState),
    v.transform((v) =>
        requiredEnumLabel(
            LifecycleFlowStateCodec.protoToOutput,
            v,
            "LifecycleFlowStateSchema",
            "flow state",
        ),
    ),
);
const LifecycleFlowStepActivityKindEnumSchema = v.pipe(
    v.enum(ProtoRead.FlowStepActivityKind),
    v.transform((v) =>
        requiredEnumLabel(
            LifecycleFlowStepActivityKindCodec.protoToOutput,
            v,
            "LifecycleFlowStepActivityKindSchema",
            "activity kind",
        ),
    ),
);
const LifecycleFlowTimelineStatusEnumSchema = v.pipe(
    v.enum(ProtoRead.FlowTimelineStatus),
    v.transform((v) =>
        requiredEnumLabel(
            LifecycleFlowTimelineStatusCodec.protoToOutput,
            v,
            "LifecycleFlowTimelineStatusSchema",
            "timeline status",
        ),
    ),
);
const LifecycleRequestFeeStatusEnumSchema = v.pipe(
    v.enum(Proto.RequestFeeStatus),
    v.transform((v) =>
        requiredEnumLabel(
            LifecycleRequestFeeStatusCodec.protoToOutput,
            v,
            "LifecycleRequestFeeStatusSchema",
            "request fee status",
        ),
    ),
);
const LifecycleIdSchema = v.pipe(
    v.bigint(),
    v.transform((v) => formatId(v)),
);
const LifecycleMsSchema = v.pipe(
    v.bigint(),
    v.transform((v) => Number(v)),
);
const LifecycleTxOccurrenceIndexSchema = v.pipe(
    v.optional(v.bigint()),
    v.transform((v) => Number(v ?? 0n)),
);
const LifecycleReasonHashSchema = v.optional(v.string(), "");
const LifecycleLedgerTransferIdSchema = v.optional(v.string(), "");

export const ListLifecycleFlowsInputSchema = v.pipe(
    v.object({
        limit: v.optional(
            v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(500))),
            100,
        ),
        reversed: v.optional(v.optional(v.boolean()), true),
        flowKind: v.pipe(
            v.optional(FlowKindSchema),
            v.transform((v) =>
                v ? LifecycleFlowKindCodec.inputToProto[v] : Proto.FlowKind.KIND_UNSPECIFIED,
            ),
        ),
        flowState: v.pipe(
            v.optional(FlowStateSchema),
            v.transform((v) =>
                v ? LifecycleFlowStateCodec.inputToProto[v] : Proto.FlowState.STATE_UNSPECIFIED,
            ),
        ),
        txRef: v.optional(
            v.pipe(
                v.string(),
                v.trim(),
                v.minLength(1),
                v.regex(canonicalTxHashPattern, "txHash must be a canonical EVM tx hash."),
            ),
        ),
        scope: v.pipe(
            v.optional(v.optional(v.picklist(LIFECYCLE_LIST_SCOPE_VALUES)), "all"),
            v.transform((v) => LifecycleListScopeCodec.inputToProto[v ?? "all"]),
        ),
        accountId: OptionalAccountIdSchema,
        ownerAccountId: OptionalOwnerAccountIdSchema,
        smartAccountAddress: OptionalSmartAccountAddressSchema,
        polyesterChainIds: v.optional(v.array(Uint32Schema)),
        zippedAssetIds: v.optional(v.array(Uint32Schema)),
        unifiedAssetIds: v.optional(v.array(Uint32Schema)),
        pageToken: v.optional(v.optional(v.pipe(v.string(), v.trim())), ""),
    }),
    v.transform((value) => {
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
    }),
);

export const LifecycleRequestFeeSchema = v.pipe(
    v.object({
        assetIds: v.optional(LifecycleAssetIdsSchema),
        amountE18: v.optional(LifecycleAmountE18Schema),
        recipientAddress: v.string(),
        status: LifecycleRequestFeeStatusEnumSchema,
    }),
    v.transform((v) => {
        return {
            ...v,
            unifiedAsset: v.assetIds ? assetForId(v.assetIds.unifiedAssetId) : undefined,
        };
    }),
);

export const GetLifecycleFlowInputSchema = v.pipe(
    v.object({
        flowId: v.pipe(v.string(), v.trim(), v.minLength(1, "flowId is required.")),
    }),
    v.transform((value) => ({
        flowId: value.flowId,
    })),
);

export const ListLifecycleFlowsByTxInputSchema = v.object({
    txHash: RequiredTxHashSchema,
    lookupKind: v.pipe(
        v.picklist(LIFECYCLE_TX_LOOKUP_KIND_VALUES),
        v.transform((v) => LifecycleTxLookupKindCodec.inputToProto[v]),
    ),
    limit: v.optional(
        v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(500))),
        100,
    ),
    pageToken: v.optional(v.optional(v.pipe(v.string(), v.trim())), ""),
});

export const LifecycleFlowStepActivitySchema = v.object({
    sequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
    txRef: v.string(),
    occurredAtUnixMs: LifecycleMsSchema,
    lifecycleSource: LifecycleSourceEnumSchema,
    reasonCode: v.pipe(v.number(), v.integer(), v.minValue(0)),
    reasonHash: LifecycleReasonHashSchema,
    currentConfirmations: v.pipe(v.number(), v.integer(), v.minValue(0)),
    requiredConfirmations: v.pipe(v.number(), v.integer(), v.minValue(0)),
    approveCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
    rejectCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
    validatorCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
    kind: LifecycleFlowStepActivityKindEnumSchema,
    requiredApprovals: v.pipe(v.number(), v.integer(), v.minValue(0)),
    requiredRejections: v.pipe(v.number(), v.integer(), v.minValue(0)),
    amountE18: v.optional(LifecycleAmountE18Schema),
    ledgerTransferId: LifecycleLedgerTransferIdSchema,
});

export const LifecycleFlowStepSchema = v.pipe(
    v.object({
        sequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
        step: LifecycleFlowStepEnumSchema,
        assetIds: v.optional(LifecycleAssetIdsSchema),
        polyesterChainId: v.pipe(v.number(), v.integer(), v.minValue(0)),
        amountE18: v.optional(LifecycleAmountE18Schema),
        requestFee: v.optional(LifecycleRequestFeeSchema),
        milestoneTxRef: v.string(),
        lifecycleSource: LifecycleSourceEnumSchema,
        reasonCode: v.pipe(v.number(), v.integer(), v.minValue(0)),
        reasonHash: LifecycleReasonHashSchema,
        currentConfirmations: v.pipe(v.number(), v.integer(), v.minValue(0)),
        requiredConfirmations: v.pipe(v.number(), v.integer(), v.minValue(0)),
        approveCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        rejectCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        validatorCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        requiredApprovals: v.pipe(v.number(), v.integer(), v.minValue(0)),
        requiredRejections: v.pipe(v.number(), v.integer(), v.minValue(0)),
        occurredAtUnixMs: LifecycleMsSchema,
        blockTimeMovingAverageMs: LifecycleMsSchema,
        activities: v.optional(v.array(LifecycleFlowStepActivitySchema), []),
    }),
    v.transform((v) => {
        return {
            ...v,
            unifiedAsset: v.assetIds ? assetForId(v.assetIds.unifiedAssetId) : undefined,
        };
    }),
);

export const LifecycleFlowTimelineItemSchema = v.object({
    sequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
    step: LifecycleFlowStepEnumSchema,
    status: LifecycleFlowTimelineStatusEnumSchema,
    expectedDurationMs: LifecycleMsSchema,
});

export const LifecycleFlowSummaryProgressSchema = v.object({
    currentStepStartedAtUnixMs: LifecycleMsSchema,
    currentStepExpectedDurationMs: LifecycleMsSchema,
    currentConfirmations: v.pipe(v.number(), v.integer(), v.minValue(0)),
    requiredConfirmations: v.pipe(v.number(), v.integer(), v.minValue(0)),
    approveCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
    rejectCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
    validatorCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
    requiredApprovals: v.pipe(v.number(), v.integer(), v.minValue(0)),
    requiredRejections: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const LifecycleFlowSummarySchema = v.pipe(
    v.object({
        ownerAccountId: LifecycleIdSchema,
        flowId: v.string(),
        flowKind: LifecycleFlowKindEnumSchema,
        latestStep: LifecycleFlowStepEnumSchema,
        assetIds: v.optional(LifecycleAssetIdsSchema),
        polyesterChainId: v.pipe(v.number(), v.integer(), v.minValue(0)),
        amountE18: v.optional(LifecycleAmountE18Schema),
        requestFee: v.optional(LifecycleRequestFeeSchema),
        sourceTxHash: v.string(),
        txOccurrenceIndex: LifecycleTxOccurrenceIndexSchema,
        sourceAddress: v.string(),
        destinationAddress: v.string(),
        sourceDomain: LifecycleFlowDomainEnumSchema,
        destinationDomain: LifecycleFlowDomainEnumSchema,
        latestTxRef: v.string(),
        latestLifecycleSource: LifecycleSourceEnumSchema,
        reasonCode: v.pipe(v.number(), v.integer(), v.minValue(0)),
        reasonHash: LifecycleReasonHashSchema,
        startedAtUnixMs: LifecycleMsSchema,
        updatedAtUnixMs: LifecycleMsSchema,
        terminalAtUnixMs: LifecycleMsSchema,
        lastActivityAtUnixMs: LifecycleMsSchema,
        isOpen: v.boolean(),
        isTerminal: v.boolean(),
        latestStepSequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
        currentProgress: v.optional(LifecycleFlowSummaryProgressSchema),
        summaryTimeline: v.optional(v.array(LifecycleFlowTimelineItemSchema), []),
        estimatedCompletionUnixMs: LifecycleMsSchema,
    }),
    v.transform((v) => {
        return {
            ...v,
            unifiedAsset: v.assetIds ? assetForId(v.assetIds.unifiedAssetId) : undefined,
        };
    }),
);

export const LifecycleFlowDetailSchema = v.object({
    summary: v.optional(LifecycleFlowSummarySchema),
    steps: v.optional(v.array(LifecycleFlowStepSchema), []),
    fromLiveState: v.boolean(),
    timeline: v.optional(v.array(LifecycleFlowTimelineItemSchema), []),
});

export const ListLifecycleFlowsOutputSchema = v.object({
    flows: v.optional(v.array(LifecycleFlowSummarySchema), []),
    nextPageToken: v.optional(v.string(), ""),
});

export const GetLifecycleFlowOutputSchema = v.object({
    flow: v.optional(LifecycleFlowDetailSchema),
});

export const LifecycleFlowTxMatchSchema = v.pipe(
    v.object({
        flowId: v.string(),
        flowKind: LifecycleFlowKindEnumSchema,
        sourceTxHash: v.string(),
        latestTxRef: v.string(),
        txOccurrenceIndex: LifecycleTxOccurrenceIndexSchema,
        sourceDomain: LifecycleFlowDomainEnumSchema,
        destinationDomain: LifecycleFlowDomainEnumSchema,
        latestStep: LifecycleFlowStepEnumSchema,
        isOpen: v.boolean(),
        isTerminal: v.boolean(),
        assetIds: v.optional(LifecycleAssetIdsSchema),
        polyesterChainId: v.pipe(v.number(), v.integer(), v.minValue(0)),
        amountE18: v.optional(LifecycleAmountE18Schema),
        sourceAddress: v.string(),
        destinationAddress: v.string(),
        reasonCode: v.pipe(v.number(), v.integer(), v.minValue(0)),
        lastActivityAtUnixMs: LifecycleMsSchema,
    }),
    v.transform((v) => {
        return {
            ...v,
            unifiedAsset: v.assetIds ? assetForId(v.assetIds.unifiedAssetId) : undefined,
        };
    }),
);

export const ListLifecycleFlowsByTxOutputSchema = v.object({
    txHash: v.string(),
    matches: v.optional(v.array(LifecycleFlowTxMatchSchema), []),
    nextPageToken: v.optional(v.string(), ""),
});

export type ListLifecycleFlowsInput = v.InferInput<typeof ListLifecycleFlowsInputSchema>;
export type ParsedListLifecycleFlowsInput = v.InferOutput<typeof ListLifecycleFlowsInputSchema>;

export type GetLifecycleFlowInput = v.InferInput<typeof GetLifecycleFlowInputSchema>;
export type ParsedGetLifecycleFlowInput = v.InferOutput<typeof GetLifecycleFlowInputSchema>;

export type ListLifecycleFlowsByTxInput = v.InferInput<typeof ListLifecycleFlowsByTxInputSchema>;
export type ParsedListLifecycleFlowsByTxInput = v.InferOutput<
    typeof ListLifecycleFlowsByTxInputSchema
>;

export type LifecycleFlowSummary = v.InferOutput<typeof LifecycleFlowSummarySchema>;
export type LifecycleFlowStep = v.InferOutput<typeof LifecycleFlowStepSchema>;
export type LifecycleFlowStepActivity = v.InferOutput<typeof LifecycleFlowStepActivitySchema>;
export type LifecycleFlowTimelineItem = v.InferOutput<typeof LifecycleFlowTimelineItemSchema>;
export type LifecycleFlowDetail = v.InferOutput<typeof LifecycleFlowDetailSchema>;

export type ListLifecycleFlowsOutput = v.InferOutput<typeof ListLifecycleFlowsOutputSchema>;
export type GetLifecycleFlowOutput = v.InferOutput<typeof GetLifecycleFlowOutputSchema>;
export type ListLifecycleFlowsByTxOutput = v.InferOutput<typeof ListLifecycleFlowsByTxOutputSchema>;

export type LifecycleAssetIds = v.InferOutput<typeof LifecycleAssetIdsSchema>;
export type LifecycleRequestFee = v.InferOutput<typeof LifecycleRequestFeeSchema>;

export type LifecycleFlowSummaryProgress = v.InferOutput<typeof LifecycleFlowSummaryProgressSchema>;
export type LifecycleFlowState = v.InferOutput<typeof LifecycleFlowStateEnumSchema>;
export type LifecycleListScope = LifecycleListScopeValue;
export type LifecycleTxLookupKind = LifecycleTxLookupKindValue;
export type LifecycleRequestFeeStatus = LifecycleRequestFeeStatusValue;

export type LifecycleFlowTxMatch = v.InferOutput<typeof LifecycleFlowTxMatchSchema>;
