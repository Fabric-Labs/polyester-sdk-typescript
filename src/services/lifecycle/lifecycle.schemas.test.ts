import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/chain/lifecycle/v1/types_pb.js";
import * as ProtoRead from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { formatId } from "../../utils/base58-id.js";
import {
    createLifecycleFlowSummarySchema,
    ListLifecycleFlowsByTxInputSchema,
    ListLifecycleFlowsInputSchema,
} from "./lifecycle.schemas.js";

const canonicalTxHash = `0x${"a".repeat(64)}`;

function lifecycleCatalog() {
    return createTestCatalog({
        assets: [
            {
                symbol: "USDT",
                ledgerId: 42,
                name: "Tether USD",
                quantityDisplayDecimals: 6,
                quantityScale: 6,
            },
        ],
    }).snapshot();
}

const baseFlowSummary = {
    ownerAccountId: 7n,
    flowId: "flow-1",
    flowKind: Proto.FlowKind.KIND_DEPOSIT,
    latestStep: ProtoRead.FlowStep.SOURCE,
    assetIds: {
        chainAssetId: 1001,
        unifiedAssetId: 42,
    },
    polyesterChainId: 8453,
    amountE18: {
        hi: 0n,
        lo: 1_500_000_000_000_000_000n,
    },
    requestFee: {
        assetIds: {
            chainAssetId: 1001,
            unifiedAssetId: 42,
        },
        amountE18: {
            hi: 0n,
            lo: 25_000_000_000_000_000n,
        },
        recipientAddress: "0x0000000000000000000000000000000000000001",
        status: Proto.RequestFeeStatus.LOCKED,
    },
    sourceTxHash: canonicalTxHash,
    txOccurrenceIndex: 0n,
    sourceAddress: "0x0000000000000000000000000000000000000001",
    destinationAddress: "0x0000000000000000000000000000000000000002",
    sourceDomain: Proto.FlowDomain.DOMAIN_EXTERNAL_CHAIN,
    destinationDomain: Proto.FlowDomain.DOMAIN_FUNDING,
    latestTxRef: canonicalTxHash,
    latestLifecycleSource: Proto.LifecycleSource.SOURCE_RELAYER,
    reasonCode: 0,
    startedAtUnixMs: 1_700_000_000_000n,
    updatedAtUnixMs: 1_700_000_001_000n,
    terminalAtUnixMs: 0n,
    lastActivityAtUnixMs: 1_700_000_002_000n,
    isOpen: true,
    isTerminal: false,
    latestStepSequence: 1,
    estimatedCompletionUnixMs: 1_700_000_100_000n,
};

describe("ListLifecycleFlowsInputSchema", () => {
    it("maps filters, defaults, and account selectors to proto input shape", () => {
        const input = v.parse(ListLifecycleFlowsInputSchema, {
            limit: 25,
            reversed: false,
            flowKind: "deposit",
            flowState: "completed",
            scope: "open",
            accountId: " 11 ",
            polyesterChainIds: [8453],
            zippedAssetIds: [1001],
            unifiedAssetIds: [42],
            pageToken: " next ",
        });

        expect(input).toEqual({
            limit: 25,
            reversed: false,
            flowKind: Proto.FlowKind.KIND_DEPOSIT,
            flowState: Proto.FlowState.STATE_COMPLETED,
            txRef: undefined,
            scope: ProtoRead.ListScope.LIST_OPEN_ONLY,
            accountSelector: {
                case: "ownerAccountId",
                value: 11n,
            },
            polyesterChainIds: [8453],
            zippedAssetIds: [1001],
            unifiedAssetIds: [42],
            pageToken: "next",
        });
    });

    it("accepts smart account selectors and rejects invalid uint32 filters", () => {
        const input = v.parse(ListLifecycleFlowsInputSchema, {
            ownerAccountId: "0x0000000000000000000000000000000000000001",
        });

        expect(input.accountSelector).toEqual({
            case: "smartAccountAddress",
            value: "0x0000000000000000000000000000000000000001",
        });
        expect(() => v.parse(ListLifecycleFlowsInputSchema, { polyesterChainIds: [0] })).toThrow();
    });
});

describe("ListLifecycleFlowsByTxInputSchema", () => {
    it("validates canonical tx hashes and maps lookup kind", () => {
        const input = v.parse(ListLifecycleFlowsByTxInputSchema, {
            txHash: ` ${canonicalTxHash} `,
            lookupKind: "any",
        });

        expect(input).toEqual({
            txHash: canonicalTxHash,
            lookupKind: ProtoRead.TxLookupKind.TX_ANY,
            limit: 100,
            pageToken: "",
        });
        expect(() =>
            v.parse(ListLifecycleFlowsByTxInputSchema, {
                txHash: "0xabc",
                lookupKind: "source",
            }),
        ).toThrow("txHash must be a canonical EVM tx hash.");
    });
});

describe("LifecycleFlowSummarySchema", () => {
    it("maps catalog assets, enum labels, u128 amounts, and timestamps", () => {
        const schema = createLifecycleFlowSummarySchema(lifecycleCatalog());

        const flow = v.parse(schema, baseFlowSummary);

        expect(flow).toMatchObject({
            ownerAccountId: formatId(7n),
            flowKind: "deposit",
            latestStep: "source",
            unifiedAsset: {
                symbol: "USDT",
                ledgerId: 42,
            },
            amountE18: "1.500000000000000000",
            requestFee: {
                amountE18: "0.025000000000000000",
                status: "locked",
                unifiedAsset: {
                    symbol: "USDT",
                    ledgerId: 42,
                },
            },
            sourceDomain: "external_chain",
            destinationDomain: "funding",
            latestLifecycleSource: "relayer",
            txOccurrenceIndex: 0,
            startedAtUnixMs: 1_700_000_000_000,
            updatedAtUnixMs: 1_700_000_001_000,
            terminalAtUnixMs: 0,
            summaryTimeline: [],
        });
    });

    it("rejects missing catalog assets and proto-zero output enums", () => {
        const schema = createLifecycleFlowSummarySchema(lifecycleCatalog());

        expect(() =>
            v.parse(schema, {
                ...baseFlowSummary,
                assetIds: {
                    chainAssetId: 1001,
                    unifiedAssetId: 404,
                },
            }),
        ).toThrow();
        expect(() =>
            v.parse(schema, {
                ...baseFlowSummary,
                flowKind: Proto.FlowKind.KIND_UNSPECIFIED,
            }),
        ).toThrow("flow kind");
    });
});
