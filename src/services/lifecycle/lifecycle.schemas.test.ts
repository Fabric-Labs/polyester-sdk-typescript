import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/chain/lifecycle/v1/types_pb.js";
import * as ProtoRead from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import * as ProtoZipper from "../../gen/chain/zipper/v1/reason_pb.js";
import { formatId } from "../../utils/base58-id.js";
import {
    createLifecycleFlowTxMatchSchema,
    createLifecycleFlowStepSchema,
    createLifecycleFlowSummarySchema,
    ListLifecycleFlowsByTxInputSchema,
    ListLifecycleFlowsInputSchema,
} from "./lifecycle.schemas.js";

const canonicalTxHash = `0x${"a".repeat(64)}`;

const baseFlowSummary = {
    ownerAccountId: 7n,
    smartAccountAddress: "0x0000000000000000000000000000000000000003",
    flowId: "flow-1",
    flowKind: Proto.FlowKind.KIND_DEPOSIT,
    currentStep: ProtoRead.FlowStep.SOURCE,
    assetIds: {
        zippedAssetId: 1001,
        unifiedAssetId: 42,
    },
    polyesterChainId: 8453,
    amountE18: {
        hi: 0n,
        lo: 1_500_000_000_000_000_000n,
    },
    requestFee: {
        assetIds: {
            zippedAssetId: 1001,
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
    lifecycleReason: 0,
    startedAtUnixMs: 1_700_000_000_000n,
    updatedAtUnixMs: 1_700_000_001_000n,
    terminalAtUnixMs: 0n,
    lastActivityAtUnixMs: 1_700_000_002_000n,
    isOpen: true,
    isTerminal: false,
    currentStepSequence: 1,
    estimatedCompletionUnixMs: 1_700_000_100_000n,
};

describe("ListLifecycleFlowsInputSchema", () => {
    it("maps filters, defaults, and account selectors to proto input shape", () => {
        const input = v.parse(ListLifecycleFlowsInputSchema, {
            limit: 25,
            sort: "oldest",
            flowKind: "deposit",
            flowState: "completed",
            scope: "open",
            accountSelector: { kind: "accountId", accountId: ` ${formatId(11n)} ` },
            polyesterChainIds: [8453],
            zippedAssetIds: [1001],
            unifiedAssetIds: [42],
            pageToken: " next ",
            orderBy: "started_at",
        });

        expect(input).toEqual({
            limit: 25,
            sort: ProtoRead.Sort.OLDEST,
            flowKind: Proto.FlowKind.KIND_DEPOSIT,
            flowState: Proto.FlowState.STATE_COMPLETED,
            txRef: undefined,
            scope: ProtoRead.ListScope.LIST_OPEN_ONLY,
            accountSelector: {
                case: "ownerAccountId",
                value: 11n,
            },
            participation: undefined,
            polyesterChainIds: [8453],
            zippedAssetIds: [1001],
            unifiedAssetIds: [42],
            pageToken: "next",
            orderBy: ProtoRead.ListOrderBy.ORDER_BY_STARTED_AT,
        });
    });

    it("defaults sort and order-by to newest last-activity first", () => {
        const input = v.parse(ListLifecycleFlowsInputSchema, {});

        expect(input.sort).toBe(ProtoRead.Sort.NEWEST);
        expect(input.orderBy).toBe(ProtoRead.ListOrderBy.ORDER_BY_LAST_ACTIVITY);
        expect(() => v.parse(ListLifecycleFlowsInputSchema, { reversed: true })).toThrow();
        expect(() => v.parse(ListLifecycleFlowsInputSchema, { orderBy: "updated_at" })).toThrow();
    });

    it("maps participation and requires an account selector for it", () => {
        const accountSelector = { kind: "accountId", accountId: formatId(11n) } as const;

        expect(
            v.parse(ListLifecycleFlowsInputSchema, { accountSelector, participation: "owner" })
                .participation,
        ).toBe(ProtoRead.FlowParticipation.PARTICIPATION_OWNER);
        expect(
            v.parse(ListLifecycleFlowsInputSchema, { accountSelector, participation: "recipient" })
                .participation,
        ).toBe(ProtoRead.FlowParticipation.PARTICIPATION_RECIPIENT);
        expect(() =>
            v.parse(ListLifecycleFlowsInputSchema, { participation: "recipient" }),
        ).toThrow("participation requires accountSelector.");
        expect(() =>
            v.parse(ListLifecycleFlowsInputSchema, { accountSelector, participation: "both" }),
        ).toThrow();
    });

    it("maps owner account selectors explicitly", () => {
        const input = v.parse(ListLifecycleFlowsInputSchema, {
            accountSelector: {
                kind: "ownerAccountId",
                ownerAccountId: ` ${formatId(12n)} `,
            },
        });

        expect(input.accountSelector).toEqual({
            case: "ownerAccountId",
            value: 12n,
        });
    });

    it("accepts smart account selectors and rejects invalid uint32 filters", () => {
        const input = v.parse(ListLifecycleFlowsInputSchema, {
            accountSelector: {
                kind: "smartAccountAddress",
                smartAccountAddress: "0x0000000000000000000000000000000000000001",
            },
        });

        expect(input.accountSelector).toEqual({
            case: "smartAccountAddress",
            value: "0x0000000000000000000000000000000000000001",
        });
        expect(() => v.parse(ListLifecycleFlowsInputSchema, { polyesterChainIds: [0] })).toThrow();
    });

    it("rejects legacy flat account selector fields", () => {
        expect(() => v.parse(ListLifecycleFlowsInputSchema, { accountId: "11" })).toThrow();
        expect(() =>
            v.parse(ListLifecycleFlowsInputSchema, {
                ownerAccountId: "12",
                smartAccountAddress: "0x0000000000000000000000000000000000000001",
            }),
        ).toThrow();
        expect(() =>
            v.parse(ListLifecycleFlowsInputSchema, {
                accountSelector: {
                    kind: "ownerAccountId",
                    ownerAccountId: "12",
                    smartAccountAddress: "0x0000000000000000000000000000000000000001",
                },
            }),
        ).toThrow();
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
    });

    it("accepts chain-native transaction ids such as BTC txids", () => {
        const btcTxHash = "622aa64b338b934395cfcc27033667fae6dce50bc11cb407ce9074f82b128be9";

        const input = v.parse(ListLifecycleFlowsByTxInputSchema, {
            txHash: btcTxHash,
            lookupKind: "source",
        });

        expect(input.txHash).toBe(btcTxHash);
        expect(input.lookupKind).toBe(ProtoRead.TxLookupKind.TX_SOURCE);
    });

    it("preserves uppercase casing for chain-native hex ids such as XRP", () => {
        const xrpTxHash = "F08F349B4623D0D85E46DE23D7FB4F29D38CCB27AD2623ED123EBFC8ED5A1DF0";

        const input = v.parse(ListLifecycleFlowsByTxInputSchema, {
            txHash: xrpTxHash,
            lookupKind: "any",
        });

        expect(input.txHash).toBe(xrpTxHash);
        expect(input.lookupKind).toBe(ProtoRead.TxLookupKind.TX_ANY);
    });

    it("rejects invalid transaction identifiers", () => {
        expect(() =>
            v.parse(ListLifecycleFlowsByTxInputSchema, {
                txHash: "0xabc",
                lookupKind: "source",
            }),
        ).toThrow("txHash must be a valid EVM hash or chain-native transaction id.");
    });
});

describe("LifecycleFlowSummarySchema", () => {
    it("maps asset ids, enum labels, decimal amounts, and timestamps", () => {
        const schema = createLifecycleFlowSummarySchema();

        const flow = v.parse(schema, baseFlowSummary);

        expect(flow).toMatchObject({
            ownerAccountId: formatId(7n),
            smartAccountAddress: "0x0000000000000000000000000000000000000003",
            flowKind: "deposit",
            currentStep: "source",
            assetIds: {
                zippedAssetId: 1001,
                unifiedAssetId: 42,
            },
            amount: "1.5",
            requestFee: {
                amount: "0.025",
                status: "locked",
                assetIds: {
                    zippedAssetId: 1001,
                    unifiedAssetId: 42,
                },
            },
            sourceDomain: "external_chain",
            destinationDomain: "funding",
            latestLifecycleSource: "relayer",
            lifecycleReason: "unspecified",
            txOccurrenceIndex: 0,
            startedAtUnixMs: 1_700_000_000_000,
            updatedAtUnixMs: 1_700_000_001_000,
            terminalAtUnixMs: 0,
            progressTimeline: [],
        });
        expect(flow).not.toHaveProperty("amountE18");
        expect(flow.requestFee).not.toHaveProperty("amountE18");
    });

    it("labels each row's participation and keeps unscoped rows unspecified", () => {
        const schema = createLifecycleFlowSummarySchema();
        const parse = (participation?: ProtoRead.FlowParticipation) =>
            v.parse(schema, { ...baseFlowSummary, participation }).participation;

        expect(parse(ProtoRead.FlowParticipation.PARTICIPATION_OWNER)).toBe("owner");
        expect(parse(ProtoRead.FlowParticipation.PARTICIPATION_RECIPIENT)).toBe("recipient");
        expect(parse(ProtoRead.FlowParticipation.PARTICIPATION_UNSPECIFIED)).toBe("unspecified");
        expect(parse()).toBe("unspecified");
    });

    it("keeps amount absent when the wire amountE18 field is unset", () => {
        const schema = createLifecycleFlowSummarySchema();
        const { amountE18: _amountE18, requestFee: _requestFee, ...rest } = baseFlowSummary;

        const flow = v.parse(schema, rest);

        expect(flow).not.toHaveProperty("amount");
        expect(flow.requestFee).toBeUndefined();
    });

    it("preserves proto-zero output enums as unspecified", () => {
        const schema = createLifecycleFlowSummarySchema();

        expect(
            v.parse(schema, {
                ...baseFlowSummary,
                flowKind: Proto.FlowKind.KIND_UNSPECIFIED,
            }),
        ).toMatchObject({ flowKind: "unspecified" });
    });

    it("maps known lifecycle reasons to labels", () => {
        const schema = createLifecycleFlowSummarySchema();

        const flow = v.parse(schema, {
            ...baseFlowSummary,
            lifecycleReason: Proto.LifecycleReason.LEDGER_MIRROR_TRANSFER_EXCEEDS_CREDITS,
        });

        expect(flow.lifecycleReason).toBe("ledger_mirror_transfer_exceeds_credits");
    });

    it.each([
        [Proto.LifecycleReason.TRADING_WITHDRAW_POLICY_DENIED, "trading_withdraw_policy_denied"],
        [
            Proto.LifecycleReason.TRADING_WITHDRAW_CONTRACT_REVERTED,
            "trading_withdraw_contract_reverted",
        ],
        [
            Proto.LifecycleReason.TRADING_WITHDRAW_EXECUTION_FAILED,
            "trading_withdraw_execution_failed",
        ],
        [Proto.LifecycleReason.ZIPPER_COMPLIANCE_TRANSFERRED, "zipper_compliance_transferred"],
    ] as const)("maps trading withdrawal lifecycle reason %i", (reason, expected) => {
        const schema = createLifecycleFlowSummarySchema();

        const flow = v.parse(schema, {
            ...baseFlowSummary,
            lifecycleReason: reason,
        });

        expect(flow.lifecycleReason).toBe(expected);
    });

    it("preserves precise Zipper reason details", () => {
        const schema = createLifecycleFlowSummarySchema();

        const flow = v.parse(schema, {
            ...baseFlowSummary,
            lifecycleReason: Proto.LifecycleReason.ZIPPER_VALIDATION_REJECTED,
            zipperReason: {
                code: ProtoZipper.ZipperReasonCode.DEPOSIT_AMOUNT_BELOW_MINIMUM,
                reasonId: "deposit_amount_below_minimum",
                message: "Deposit amount is below the configured minimum.",
            },
        });

        expect(flow.zipperReason).toEqual({
            code: "deposit_amount_below_minimum",
            reasonId: "deposit_amount_below_minimum",
            message: "Deposit amount is below the configured minimum.",
        });
    });

    it("keeps an uncataloged Zipper reason code readable", () => {
        const flow = v.parse(createLifecycleFlowSummarySchema(), {
            ...baseFlowSummary,
            zipperReason: { code: 9999, reasonId: "future.reason", message: "Future." },
        });

        expect(flow.zipperReason?.code).toBe("unknown_zipper_reason_9999");
    });

    it("maps SOURCE_UNSPECIFIED lifecycle source on in-progress flows", () => {
        const schema = createLifecycleFlowSummarySchema();

        const flow = v.parse(schema, {
            ...baseFlowSummary,
            latestLifecycleSource: Proto.LifecycleSource.SOURCE_UNSPECIFIED,
        });

        expect(flow.latestLifecycleSource).toBe("unspecified");
    });

    it("decodes uncataloged lifecycle reasons with the code preserved", () => {
        const schema = createLifecycleFlowSummarySchema();

        // Regression: the backend shipped reason code 2001 on FLOW_STEP_FAILED
        // withdrawals before the SDK enum caught up; a strict enum rejected the
        // whole summary and froze the flow on its last good step in the UI.
        const flow = v.parse(schema, {
            ...baseFlowSummary,
            currentStep: ProtoRead.FlowStep.FAILED,
            isOpen: false,
            isTerminal: true,
            lifecycleReason: 2001,
        });

        expect(flow.currentStep).toBe("failed");
        expect(flow.lifecycleReason).toBe("unknown_reason_2001");
        expect(() => v.parse(schema, { ...baseFlowSummary, lifecycleReason: -1 })).toThrow();
        expect(() => v.parse(schema, { ...baseFlowSummary, lifecycleReason: 1.5 })).toThrow();
    });
});

describe("LifecycleFlowTxMatchSchema", () => {
    it("maps owner identity fields added to transaction matches", () => {
        const schema = createLifecycleFlowTxMatchSchema();

        const match = v.parse(schema, {
            ...baseFlowSummary,
            lifecycleReason: Proto.LifecycleReason.ZIPPER_VALIDATION_REJECTED,
            zipperReason: {
                code: ProtoZipper.ZipperReasonCode.REQUEST_VERIFICATION_REJECTED,
                reasonId: "request_verification_rejected",
                message: "Request verification was rejected.",
            },
            lastActivityAtUnixMs: 1_700_000_002_000n,
        });

        expect(match).toMatchObject({
            ownerAccountId: formatId(7n),
            smartAccountAddress: "0x0000000000000000000000000000000000000003",
            flowId: "flow-1",
            flowKind: "deposit",
            currentStep: "source",
            lifecycleReason: "zipper_validation_rejected",
            zipperReason: {
                code: "request_verification_rejected",
                reasonId: "request_verification_rejected",
                message: "Request verification was rejected.",
            },
        });
    });
});

describe("LifecycleFlowStepSchema", () => {
    it("preserves precise Zipper details on steps and nested activities", () => {
        const zipperReason = {
            code: ProtoZipper.ZipperReasonCode.REQUEST_VERIFICATION_REJECTED,
            reasonId: "request_verification_rejected",
            message: "Request verification was rejected.",
        };
        const activity = {
            sequence: 2,
            txRef: canonicalTxHash,
            occurredAtUnixMs: 1_700_000_002_000n,
            lifecycleSource: Proto.LifecycleSource.SOURCE_EXECUTOR,
            lifecycleReason: Proto.LifecycleReason.ZIPPER_VALIDATION_REJECTED,
            zipperReason,
            currentConfirmations: 0,
            requiredConfirmations: 0,
            approveCount: 1,
            rejectCount: 2,
            validatorCount: 3,
            kind: ProtoRead.FlowStepActivityKind.ACTIVITY_UNSPECIFIED,
            requiredApprovals: 2,
            requiredRejections: 2,
            ledgerTransferId: "",
        };

        const step = v.parse(createLifecycleFlowStepSchema(), {
            sequence: 2,
            step: ProtoRead.FlowStep.FAILED,
            polyesterChainId: 8453,
            milestoneTxRef: canonicalTxHash,
            lifecycleSource: Proto.LifecycleSource.SOURCE_EXECUTOR,
            lifecycleReason: Proto.LifecycleReason.ZIPPER_VALIDATION_REJECTED,
            zipperReason,
            currentConfirmations: 0,
            requiredConfirmations: 0,
            approveCount: 1,
            rejectCount: 2,
            validatorCount: 3,
            requiredApprovals: 2,
            requiredRejections: 2,
            occurredAtUnixMs: 1_700_000_002_000n,
            blockTimeMovingAverageMs: 1_000n,
            activities: [activity],
        });

        const decodedReason = { ...zipperReason, code: "request_verification_rejected" };
        expect(step).toMatchObject({
            lifecycleReason: "zipper_validation_rejected",
            zipperReason: decodedReason,
            activities: [
                {
                    lifecycleReason: "zipper_validation_rejected",
                    zipperReason: decodedReason,
                },
            ],
        });
    });

    it("keeps a refunded withdrawal's refund address and kept request fee", () => {
        const step = v.parse(createLifecycleFlowStepSchema(), {
            sequence: 4,
            step: ProtoRead.FlowStep.REFUNDED,
            polyesterChainId: 8453,
            requestFee: {
                ...baseFlowSummary.requestFee,
                status: Proto.RequestFeeStatus.KEPT,
            },
            milestoneTxRef: canonicalTxHash,
            lifecycleSource: Proto.LifecycleSource.SOURCE_EXECUTOR,
            lifecycleReason: Proto.LifecycleReason.ZIPPER_EXECUTION_REJECTED,
            currentConfirmations: 0,
            requiredConfirmations: 0,
            approveCount: 0,
            rejectCount: 0,
            validatorCount: 0,
            requiredApprovals: 0,
            requiredRejections: 0,
            occurredAtUnixMs: 1_700_000_002_000n,
            blockTimeMovingAverageMs: 1_000n,
            refundAddress: "0x0000000000000000000000000000000000000003",
        });

        expect(step).toMatchObject({
            step: "refunded",
            requestFee: { status: "kept" },
            refundAddress: "0x0000000000000000000000000000000000000003",
        });
    });
});
