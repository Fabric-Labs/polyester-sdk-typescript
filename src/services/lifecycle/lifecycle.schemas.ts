import * as v from "valibot";
import * as Proto from "../../gen/chain/lifecycle/v1/types_pb.js";
import * as ProtoRead from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import {
    LIFECYCLE_FLOW_KIND_VALUES,
    LIFECYCLE_FLOW_STATE_VALUES,
    LIFECYCLE_LIST_SCOPE_VALUES,
    LIFECYCLE_LIST_ORDER_BY_VALUES,
    LIFECYCLE_SORT_VALUES,
    LIFECYCLE_TX_LOOKUP_KIND_VALUES,
    LifecycleFlowDomainCodec,
    LifecycleFlowKindCodec,
    lifecycleReasonFromCode,
    LifecycleFlowStateCodec,
    LifecycleFlowStepActivityKindCodec,
    LifecycleFlowStepCodec,
    LifecycleFlowTimelineStatusCodec,
    LifecycleListOrderByCodec,
    LifecycleListScopeCodec,
    LifecycleRequestFeeStatusCodec,
    LifecycleSortCodec,
    LifecycleSourceCodec,
    LifecycleTxLookupKindCodec,
    type LifecycleReasonValue,
    type LifecycleListOrderByValue,
    type LifecycleListScopeValue,
    type LifecycleRequestFeeStatusValue,
    type LifecycleSortValue,
    type LifecycleTxLookupKindValue,
} from "./lifecycle.codecs.js";
import { idToBigInt } from "../../utils/base58-id.js";
import { fromU128 } from "../../utils/u128.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { PublicIdSchema } from "../../shared/schemas.js";
import { E18_SCALE, scaledToDecimalOutput } from "../../shared/decimal-surface.js";

const FlowKindSchema = v.picklist(LIFECYCLE_FLOW_KIND_VALUES);
const FlowStateSchema = v.picklist(LIFECYCLE_FLOW_STATE_VALUES);

const canonicalTxHashPattern = /^0x[0-9a-fA-F]{64}$/;
const chainTxHexPattern = /^[0-9a-fA-F]{64}$/;
const chainNativeTxIdPattern = /^[A-Za-z0-9]{8,128}$/;
const smartAccountAddressPattern = /^0x[0-9a-fA-F]{40}$/;
const maxUint32 = 4_294_967_295;

function isChainTxIdentifier(value: string): boolean {
    if (canonicalTxHashPattern.test(value)) return true;
    if (chainTxHexPattern.test(value)) return true;
    return chainNativeTxIdPattern.test(value);
}

function normalizeChainTxIdentifier(value: string): string {
    if (canonicalTxHashPattern.test(value)) return value.toLowerCase();
    // Preserve caller casing — XRP and other chains may be case-sensitive on the API.
    if (chainTxHexPattern.test(value)) return value;
    return value;
}

const ChainTxIdentifierSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "txHash is required."),
    v.check(isChainTxIdentifier, "txHash must be a valid EVM hash or chain-native transaction id."),
    v.transform(normalizeChainTxIdentifier),
);

const AccountSelectorIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const SmartAccountAddressSchema = v.pipe(
    v.string(),
    v.trim(),
    v.regex(smartAccountAddressPattern, "smartAccountAddress must be a canonical 0x address."),
);

const LifecycleAccountSelectorInputSchema = v.pipe(
    v.variant("kind", [
        v.strictObject({
            kind: v.literal("accountId"),
            accountId: AccountSelectorIdSchema,
        }),
        v.strictObject({
            kind: v.literal("ownerAccountId"),
            ownerAccountId: AccountSelectorIdSchema,
        }),
        v.strictObject({
            kind: v.literal("smartAccountAddress"),
            smartAccountAddress: SmartAccountAddressSchema,
        }),
    ]),
    v.transform((selector) => {
        switch (selector.kind) {
            case "accountId":
                return {
                    case: "ownerAccountId" as const,
                    value: idToBigInt(selector.accountId, "accountId"),
                };
            case "ownerAccountId":
                return {
                    case: "ownerAccountId" as const,
                    value: idToBigInt(selector.ownerAccountId, "ownerAccountId"),
                };
            case "smartAccountAddress":
                return {
                    case: "smartAccountAddress" as const,
                    value: selector.smartAccountAddress,
                };
        }
    }),
);

const Uint32Schema = v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(maxUint32));

const LifecycleU128RawSchema = v.object({
    hi: v.bigint(),
    lo: v.bigint(),
});

/**
 * Wire `amount_e18` u128 → public decimal string. On-chain unified-asset
 * amounts are always 18-decimal scaled, so the conversion uses the constant
 * E18 scale and needs no catalog access.
 */
const LifecycleAmountSchema = v.pipe(
    LifecycleU128RawSchema,
    v.transform((v) => scaledToDecimalOutput(fromU128(v), E18_SCALE)),
);

/**
 * Renames the wire `amountE18` key to the public decimal `amount` field.
 * Preserves optional semantics exactly: when the wire field is unset, the
 * output carries no `amount` key.
 */
function renameAmountE18<T extends { amountE18?: string }>(
    value: T,
): Omit<T, "amountE18"> & { amount?: string } {
    const { amountE18, ...rest } = value;
    return amountE18 === undefined ? rest : { ...rest, amount: amountE18 };
}

const LifecycleAssetIdsSchema = v.object({
    zippedAssetId: v.pipe(v.number(), v.integer(), v.minValue(0)),
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
/**
 * `REASON_UNSPECIFIED` (0) is the normal wire value for flows without a
 * notable reason, so this schema accepts zero unlike the other lifecycle enum
 * schemas. The catalog also grows on the backend ahead of SDK regeneration, so
 * uncataloged codes decode to `unknown_reason_${code}` instead of rejecting the whole flow —
 * a strict enum here froze failed flows out of the UI when the backend shipped
 * new reason codes.
 */
const LifecycleReasonEnumSchema = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.transform((value) => lifecycleReasonFromCode(value)),
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
const LifecycleMsSchema = v.pipe(
    v.bigint(),
    v.transform((v) => Number(v)),
);
const LifecycleTxOccurrenceIndexSchema = v.pipe(
    v.optional(v.bigint()),
    v.transform((v) => Number(v ?? 0n)),
);
const LifecycleLedgerTransferIdSchema = v.optional(v.string(), "");
const LifecycleZipperReasonSchema = v.object({
    code: v.pipe(v.number(), v.integer(), v.minValue(0)),
    reasonId: v.string(),
    message: v.string(),
});

export const ListLifecycleFlowsInputSchema = v.pipe(
    v.strictObject({
        limit: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(500)), 100),
        sort: v.pipe(
            v.optional(v.picklist(LIFECYCLE_SORT_VALUES), "newest"),
            v.transform((value) => LifecycleSortCodec.inputToProto[value]),
        ),
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
        txRef: v.optional(ChainTxIdentifierSchema),
        scope: v.pipe(
            v.optional(v.picklist(LIFECYCLE_LIST_SCOPE_VALUES), "all"),
            v.transform((v) => LifecycleListScopeCodec.inputToProto[v ?? "all"]),
        ),
        accountSelector: v.optional(LifecycleAccountSelectorInputSchema),
        polyesterChainIds: v.optional(v.array(Uint32Schema)),
        zippedAssetIds: v.optional(v.array(Uint32Schema)),
        unifiedAssetIds: v.optional(v.array(Uint32Schema)),
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
        orderBy: v.pipe(
            v.optional(v.picklist(LIFECYCLE_LIST_ORDER_BY_VALUES), "last_activity"),
            v.transform((value) => LifecycleListOrderByCodec.inputToProto[value]),
        ),
    }),
    v.transform((value) => {
        return {
            limit: value.limit,
            sort: value.sort,
            flowKind: value.flowKind,
            flowState: value.flowState,
            txRef: value.txRef,
            scope: value.scope,
            accountSelector: value.accountSelector,
            polyesterChainIds: value.polyesterChainIds,
            zippedAssetIds: value.zippedAssetIds,
            unifiedAssetIds: value.unifiedAssetIds,
            pageToken: value.pageToken,
            orderBy: value.orderBy,
        };
    }),
);

export const LifecycleRequestFeeSchema = v.pipe(
    v.object({
        assetIds: v.optional(LifecycleAssetIdsSchema),
        amountE18: v.optional(LifecycleAmountSchema),
        recipientAddress: v.string(),
        status: LifecycleRequestFeeStatusEnumSchema,
    }),
    v.transform((value) => renameAmountE18(value)),
);

export function createLifecycleRequestFeeSchema() {
    return LifecycleRequestFeeSchema;
}

export const GetLifecycleFlowInputSchema = v.pipe(
    v.strictObject({
        flowId: v.pipe(v.string(), v.trim(), v.minLength(1, "flowId is required.")),
    }),
    v.transform((value) => ({
        flowId: value.flowId,
    })),
);

export const ListLifecycleFlowsByTxInputSchema = v.strictObject({
    txHash: ChainTxIdentifierSchema,
    lookupKind: v.pipe(
        v.picklist(LIFECYCLE_TX_LOOKUP_KIND_VALUES),
        v.transform((v) => LifecycleTxLookupKindCodec.inputToProto[v]),
    ),
    limit: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(500)), 100),
    pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
});

export const LifecycleFlowStepActivitySchema = v.pipe(
    v.object({
        sequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
        txRef: v.string(),
        occurredAtUnixMs: LifecycleMsSchema,
        lifecycleSource: LifecycleSourceEnumSchema,
        lifecycleReason: LifecycleReasonEnumSchema,
        zipperReason: v.optional(LifecycleZipperReasonSchema),
        currentConfirmations: v.pipe(v.number(), v.integer(), v.minValue(0)),
        requiredConfirmations: v.pipe(v.number(), v.integer(), v.minValue(0)),
        approveCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        rejectCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        validatorCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        kind: LifecycleFlowStepActivityKindEnumSchema,
        requiredApprovals: v.pipe(v.number(), v.integer(), v.minValue(0)),
        requiredRejections: v.pipe(v.number(), v.integer(), v.minValue(0)),
        amountE18: v.optional(LifecycleAmountSchema),
        ledgerTransferId: LifecycleLedgerTransferIdSchema,
    }),
    v.transform((value) => renameAmountE18(value)),
);

export const LifecycleFlowStepSchema = v.pipe(
    v.object({
        sequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
        step: LifecycleFlowStepEnumSchema,
        assetIds: v.optional(LifecycleAssetIdsSchema),
        polyesterChainId: v.pipe(v.number(), v.integer(), v.minValue(0)),
        amountE18: v.optional(LifecycleAmountSchema),
        requestFee: v.optional(LifecycleRequestFeeSchema),
        milestoneTxRef: v.string(),
        lifecycleSource: LifecycleSourceEnumSchema,
        lifecycleReason: LifecycleReasonEnumSchema,
        zipperReason: v.optional(LifecycleZipperReasonSchema),
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
    v.transform((value) => renameAmountE18(value)),
);

export function createLifecycleFlowStepSchema() {
    return LifecycleFlowStepSchema;
}

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
        ownerAccountId: PublicIdSchema,
        smartAccountAddress: v.string(),
        flowId: v.string(),
        flowKind: LifecycleFlowKindEnumSchema,
        currentStep: LifecycleFlowStepEnumSchema,
        assetIds: v.optional(LifecycleAssetIdsSchema),
        polyesterChainId: v.pipe(v.number(), v.integer(), v.minValue(0)),
        amountE18: v.optional(LifecycleAmountSchema),
        requestFee: v.optional(LifecycleRequestFeeSchema),
        sourceTxHash: v.string(),
        txOccurrenceIndex: LifecycleTxOccurrenceIndexSchema,
        sourceAddress: v.string(),
        destinationAddress: v.string(),
        sourceDomain: LifecycleFlowDomainEnumSchema,
        destinationDomain: LifecycleFlowDomainEnumSchema,
        latestTxRef: v.string(),
        latestLifecycleSource: LifecycleSourceEnumSchema,
        lifecycleReason: LifecycleReasonEnumSchema,
        zipperReason: v.optional(LifecycleZipperReasonSchema),
        startedAtUnixMs: LifecycleMsSchema,
        updatedAtUnixMs: LifecycleMsSchema,
        terminalAtUnixMs: LifecycleMsSchema,
        lastActivityAtUnixMs: LifecycleMsSchema,
        isOpen: v.boolean(),
        isTerminal: v.boolean(),
        currentStepSequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
        currentProgress: v.optional(LifecycleFlowSummaryProgressSchema),
        progressTimeline: v.optional(v.array(LifecycleFlowTimelineItemSchema), []),
        estimatedCompletionUnixMs: LifecycleMsSchema,
    }),
    v.transform((value) => renameAmountE18(value)),
);

export function createLifecycleFlowSummarySchema() {
    return LifecycleFlowSummarySchema;
}

export const LifecycleFlowDetailSchema = v.object({
    summary: v.optional(LifecycleFlowSummarySchema),
    observedSteps: v.optional(v.array(LifecycleFlowStepSchema), []),
    fromLiveState: v.boolean(),
});

export function createLifecycleFlowDetailSchema() {
    return LifecycleFlowDetailSchema;
}

export const ListLifecycleFlowsOutputSchema = v.object({
    flows: v.optional(v.array(LifecycleFlowSummarySchema), []),
    nextPageToken: v.optional(v.string(), ""),
});

export function createListLifecycleFlowsOutputSchema() {
    return ListLifecycleFlowsOutputSchema;
}

export const GetLifecycleFlowOutputSchema = v.object({
    flow: v.optional(LifecycleFlowDetailSchema),
});

export function createGetLifecycleFlowOutputSchema() {
    return GetLifecycleFlowOutputSchema;
}

export const LifecycleFlowTxMatchSchema = v.pipe(
    v.object({
        ownerAccountId: PublicIdSchema,
        smartAccountAddress: v.string(),
        flowId: v.string(),
        flowKind: LifecycleFlowKindEnumSchema,
        sourceTxHash: v.string(),
        latestTxRef: v.string(),
        txOccurrenceIndex: LifecycleTxOccurrenceIndexSchema,
        sourceDomain: LifecycleFlowDomainEnumSchema,
        destinationDomain: LifecycleFlowDomainEnumSchema,
        currentStep: LifecycleFlowStepEnumSchema,
        isOpen: v.boolean(),
        isTerminal: v.boolean(),
        assetIds: v.optional(LifecycleAssetIdsSchema),
        polyesterChainId: v.pipe(v.number(), v.integer(), v.minValue(0)),
        amountE18: v.optional(LifecycleAmountSchema),
        sourceAddress: v.string(),
        destinationAddress: v.string(),
        lifecycleReason: LifecycleReasonEnumSchema,
        zipperReason: v.optional(LifecycleZipperReasonSchema),
        lastActivityAtUnixMs: LifecycleMsSchema,
    }),
    v.transform((value) => renameAmountE18(value)),
);

export function createLifecycleFlowTxMatchSchema() {
    return LifecycleFlowTxMatchSchema;
}

export const ListLifecycleFlowsByTxOutputSchema = v.object({
    txHash: v.string(),
    matches: v.optional(v.array(LifecycleFlowTxMatchSchema), []),
    nextPageToken: v.optional(v.string(), ""),
});

export function createListLifecycleFlowsByTxOutputSchema() {
    return ListLifecycleFlowsByTxOutputSchema;
}

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
export type LifecycleReason = LifecycleReasonValue;
export type LifecycleZipperReason = v.InferOutput<typeof LifecycleZipperReasonSchema>;
export type LifecycleListOrderBy = LifecycleListOrderByValue;
export type LifecycleListScope = LifecycleListScopeValue;
export type LifecycleSort = LifecycleSortValue;
export type LifecycleTxLookupKind = LifecycleTxLookupKindValue;
export type LifecycleRequestFeeStatus = LifecycleRequestFeeStatusValue;

export type LifecycleFlowTxMatch = v.InferOutput<typeof LifecycleFlowTxMatchSchema>;
