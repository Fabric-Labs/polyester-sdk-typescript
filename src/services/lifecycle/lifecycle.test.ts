import * as ProtoRead from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import * as ProtoTypes from "../../gen/chain/lifecycle/v1/types_pb.js";
import { realtimeClientStub, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { describe, expect, it, vi } from "vitest";
import { LifecycleService } from "./lifecycle.js";

const txHash = "0x1111111111111111111111111111111111111111111111111111111111111111";

function flowSummary() {
    return {
        ownerAccountId: 42n,
        smartAccountAddress: "0x3333333333333333333333333333333333333333",
        flowId: "flow-1",
        flowKind: ProtoTypes.FlowKind.KIND_DEPOSIT,
        currentStep: ProtoRead.FlowStep.SOURCE,
        polyesterChainId: 1,
        sourceTxHash: txHash,
        sourceAddress: "0x1111111111111111111111111111111111111111",
        destinationAddress: "0x2222222222222222222222222222222222222222",
        sourceDomain: ProtoTypes.FlowDomain.DOMAIN_EXTERNAL_CHAIN,
        destinationDomain: ProtoTypes.FlowDomain.DOMAIN_FUNDING,
        latestTxRef: txHash,
        latestLifecycleSource: ProtoTypes.LifecycleSource.SOURCE_RELAYER,
        lifecycleReason: 0,
        startedAtUnixMs: 1n,
        updatedAtUnixMs: 2n,
        terminalAtUnixMs: 0n,
        lastActivityAtUnixMs: 2n,
        isOpen: true,
        isTerminal: false,
        currentStepSequence: 0,
        estimatedCompletionUnixMs: 3n,
    };
}

function flowDetail() {
    return {
        summary: flowSummary(),
        observedSteps: [],
        fromLiveState: true,
    };
}

describe("LifecycleService", () => {
    it("normalizes list/get/list-by-tx requests and parses empty result sets", async () => {
        const responses = [
            { flows: [], nextPageToken: "next" },
            { flow: flowDetail() },
            { txHash, matches: [], nextPageToken: "" },
        ];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const realtime = realtimeClientStub();
        const service = new LifecycleService({ publicApi: transport.transport }, realtime.realtime);
        const signal = new AbortController().signal;

        await expect(
            service.listFlows(
                {
                    limit: 25,
                    sort: "oldest",
                    flowKind: "deposit",
                    flowState: "completed",
                    scope: "open",
                    accountSelector: { kind: "accountId", accountId: formatId(42n) },
                    pageToken: "cursor",
                    orderBy: "started_at",
                },
                { signal },
            ),
        ).resolves.toEqual({ flows: [], nextPageToken: "next" });
        await expect(service.getFlow({ flowId: " flow-1 " })).resolves.toMatchObject({
            flow: {
                summary: {
                    flowId: "flow-1",
                    flowKind: "deposit",
                    currentStep: "source",
                    ownerAccountId: formatId(42n),
                    smartAccountAddress: "0x3333333333333333333333333333333333333333",
                },
                fromLiveState: true,
            },
        });
        await expect(
            service.listFlowsByTx({ txHash: ` ${txHash} `, lookupKind: "any" }),
        ).resolves.toEqual({ txHash, matches: [], nextPageToken: "" });

        expect(transport.calls[0]?.message).toMatchObject({
            limit: 25,
            sort: ProtoRead.Sort.OLDEST,
            flowKind: ProtoTypes.FlowKind.KIND_DEPOSIT,
            flowState: ProtoTypes.FlowState.STATE_COMPLETED,
            scope: ProtoRead.ListScope.LIST_OPEN_ONLY,
            accountSelector: { case: "ownerAccountId", value: 42n },
            pageToken: "cursor",
            orderBy: ProtoRead.ListOrderBy.ORDER_BY_STARTED_AT,
        });
        expect(transport.calls[0]?.signal).toBe(signal);
        expect(transport.calls[1]?.message).toMatchObject({ flowId: "flow-1" });
        expect(transport.calls[2]?.message).toMatchObject({
            txHash,
            lookupKind: ProtoRead.TxLookupKind.TX_ANY,
            limit: 100,
            pageToken: "",
        });
    });

    it("subscribes to public and private open-flow channels and parses publications", () => {
        const transport = unaryTransport({});
        const realtime = realtimeClientStub();
        const service = new LifecycleService({ publicApi: transport.transport }, realtime.realtime);
        const onPublic = vi.fn();
        const onPrivate = vi.fn();

        service.subscribeOpenFlows({ onEvent: onPublic });
        expect(realtime.params?.channel).toBe("public:chain:lifecycle:flows:proto");
        expect(realtime.params?.schema).toBe(ProtoRead.FlowSummaryViewSchema);
        realtime.params?.onPublication(flowSummary() as never);
        expect(onPublic).toHaveBeenCalledWith(
            expect.objectContaining({ flowId: "flow-1", flowKind: "deposit" }),
        );

        service.subscribeOpenFlows({ accountId: " acct-1 ", onEvent: onPrivate });
        expect(realtime.params?.channel).toBe("private:chain:lifecycle:flows:acct-1:proto");
        realtime.params?.onPublication(flowSummary() as never);
        expect(onPrivate).toHaveBeenCalledWith(
            expect.objectContaining({ flowId: "flow-1", currentStep: "source" }),
        );
    });

    it("subscribes to detail channels and no-ops invalid detail inputs before connecting", () => {
        const transport = unaryTransport({});
        const realtime = realtimeClientStub();
        const service = new LifecycleService({ publicApi: transport.transport }, realtime.realtime);
        const onEvent = vi.fn();

        service.subscribeFlowDetail({ flowId: " flow-1 ", onEvent });
        expect(realtime.params?.channel).toBe("public:chain:lifecycle:flow:flow-1:proto");
        expect(realtime.params?.schema).toBe(ProtoRead.FlowDetailViewSchema);
        realtime.params?.onPublication(flowDetail() as never);
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                fromLiveState: true,
                summary: expect.objectContaining({ flowId: "flow-1" }),
            }),
        );

        const unsubscribe = service.subscribeFlowDetail({ flowId: " ", onEvent: vi.fn() });
        expect(unsubscribe()).toBeUndefined();
        expect(realtime.connectProtoChannel).toHaveBeenCalledTimes(1);
    });
});
