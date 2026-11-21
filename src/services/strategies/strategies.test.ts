import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import {
    AlreadyExistsError,
    PreconditionFailedError,
    RateLimitError,
    RevisionConflictError,
    ValidationError,
} from "../../shared/errors.js";
import { rejectingUnaryTransport, unaryTransportByMethod } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { StrategiesService } from "./strategies.js";

const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

function serviceWith(responses: Record<string, Record<string, unknown>>) {
    const transport = unaryTransportByMethod(responses);
    return { transport, service: new StrategiesService({ authApi: transport.transport }) };
}

function rejectingService(
    code: Code,
    detail: Parameters<typeof create<typeof Proto.ErrorDetailSchema>>[1],
) {
    const error = new ConnectError("rejected", code, undefined, [
        { desc: Proto.ErrorDetailSchema, value: create(Proto.ErrorDetailSchema, detail) },
    ]);
    return new StrategiesService({
        authApi: createErrorMappingTransport(rejectingUnaryTransport(error)),
    });
}

describe("StrategiesService", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("creates a strategy from one source and rejects two", async () => {
        const { transport, service } = serviceWith({
            createStrategy: create(Proto.CreateStrategyResponseSchema, {
                strategy: {
                    strategyId: 5n,
                    name: "Grid",
                    revision: 1n,
                    headVersionId: "v1",
                    origin: { source: { case: "templateId", value: "grid" } },
                },
                version: { versionId: "v1", valid: true },
            }),
        });

        const result = await service.create({
            name: " Grid ",
            templateId: "grid",
            idempotencyKey: "c-1",
        });
        expect(transport.lastCall()?.method.name).toBe("CreateStrategy");
        expect(transport.lastCall()?.message).toEqual({
            name: "Grid",
            source: { case: "templateId", value: "grid" },
            idempotencyKey: "c-1",
        });
        expect(result).toMatchObject({
            strategy: {
                strategyId: formatId(5n),
                revision: "1",
                origin: { kind: "template", templateId: "grid" },
                bot: null,
            },
            version: { versionId: "v1", valid: true, flow: null },
        });

        await service.create({ name: "Blank", idempotencyKey: "c-2" });
        expect(transport.lastCall()?.message).toMatchObject({ source: { case: undefined } });
        await expect(
            service.create({
                name: "Grid",
                templateId: "grid",
                versionId: "v1",
                idempotencyKey: "c",
            }),
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("saves a draft and returns its issues and flow as data, not an error", async () => {
        const manifest = { settings: [], events: ["candle"] };
        const { transport, service } = serviceWith({
            saveDraftVersion: create(Proto.SaveDraftVersionResponseSchema, {
                revision: 2n,
                version: {
                    versionId: "v1",
                    runtimeVersion: "2026-12",
                    valid: false,
                    errors: [{ line: 3, column: 7, rule: "syntax", message: "unexpected token" }],
                    moneyCard: { budget: { asset: "USDT", amount: "50" }, markets: ["BTC-USDT"] },
                    flow: {
                        nodes: [
                            { nodeId: "t0", kind: Proto.FlowNode_Kind.TRIGGER, label: "Every day" },
                        ],
                        edges: [{ fromNodeId: "t0", toNodeId: "a0" }],
                        complete: true,
                    },
                },
            }),
        });

        const result = await service.saveDraftVersion({
            strategyId: formatId(5n),
            expectedRevision: "1",
            name: " Grid ",
            manifest,
            code: "bot()",
        });

        expect(transport.lastCall()?.message).toEqual({
            strategyId: 5n,
            expectedRevision: 1n,
            name: "Grid",
            manifest,
            code: "bot()",
            runtimeVersion: "",
            idempotencyKey: "",
        });
        expect(result).toMatchObject({
            revision: "2",
            version: {
                versionId: "v1",
                valid: false,
                errors: [{ manifestPath: "", line: 3, column: 7, rule: "syntax" }],
                moneyCard: { budget: { asset: "USDT", amount: "50" }, maxOrder: null },
                flow: {
                    nodes: [{ nodeId: "t0", kind: "trigger", label: "Every day", span: null }],
                    edges: [{ fromNodeId: "t0", toNodeId: "a0", branch: "" }],
                    complete: true,
                },
            },
        });
    });

    it("reads a strategy with its head version, and a blank one with none", async () => {
        const { transport, service } = serviceWith({
            getStrategy: create(Proto.GetStrategyResponseSchema, {
                strategy: {
                    strategyId: 5n,
                    revision: 3n,
                    origin: {
                        source: { case: "duplicate", value: { sourceVersionId: "v0" } },
                    },
                    bot: { botId: 3n, status: Proto.Bot_Status.RUNNING },
                },
                head: { versionId: "v3", code: "bot()", manifest: { name: "Grid" } },
            }),
        });

        await expect(service.get({ strategyId: formatId(5n) })).resolves.toMatchObject({
            strategy: {
                revision: "3",
                origin: { kind: "duplicate", sourceVersionId: "v0" },
                bot: { botId: formatId(3n), status: "running" },
            },
            head: { versionId: "v3", code: "bot()", manifest: { name: "Grid" }, createdAt: null },
        });
        expect(transport.lastCall()?.message).toEqual({ strategyId: 5n });
    });

    it("lists strategies and their revisions with page tokens", async () => {
        const { transport, service } = serviceWith({
            listStrategies: create(Proto.ListStrategiesResponseSchema, {
                strategies: [{ strategyId: 5n, name: "Grid" }],
                nextPageToken: "next",
            }),
            listStrategyRevisions: create(Proto.ListStrategyRevisionsResponseSchema, {
                revisions: [
                    {
                        revision: 2n,
                        versionId: "v2",
                        savedBy: Proto.StrategyRevision_SavedBy.API_KEY,
                    },
                ],
            }),
        });

        await expect(service.list({ limit: 20 })).resolves.toMatchObject({
            strategies: [{ strategyId: formatId(5n), name: "Grid", revision: "0", origin: null }],
            nextPageToken: "next",
        });
        expect(transport.lastCall()?.message).toEqual({ limit: 20, pageToken: "" });

        await expect(
            service.listRevisions({ strategyId: formatId(5n), pageToken: "next" }),
        ).resolves.toEqual({
            revisions: [
                { revision: "2", versionId: "v2", valid: false, savedAt: null, savedBy: "api_key" },
            ],
            nextPageToken: "",
        });
        expect(transport.lastCall()?.message).toEqual({ strategyId: 5n, pageToken: "next" });
    });

    it("renames and deletes a strategy", async () => {
        const { transport, service } = serviceWith({
            renameStrategy: create(Proto.RenameStrategyResponseSchema, {
                strategy: { strategyId: 5n, name: "Renamed" },
            }),
            deleteStrategy: {},
        });

        await expect(
            service.rename({ strategyId: formatId(5n), name: " Renamed " }),
        ).resolves.toMatchObject({ strategyId: formatId(5n), name: "Renamed" });
        expect(transport.lastCall()?.message).toEqual({ strategyId: 5n, name: "Renamed" });

        await expect(service.delete({ strategyId: formatId(5n) })).resolves.toBeUndefined();
        expect(transport.lastCall()?.method.name).toBe("DeleteStrategy");
        expect(transport.lastCall()?.message).toEqual({ strategyId: 5n });
    });

    it("reads a strategy version's manifest, code and flow", async () => {
        const { transport, service } = serviceWith({
            getStrategyVersion: create(Proto.GetStrategyVersionResponseSchema, {
                versionId: "v1",
                name: "Grid",
                code: "bot()",
                valid: true,
                createdAt: ts(1_700_000_000),
            }),
        });

        await expect(service.getVersion({ versionId: "v1" })).resolves.toEqual({
            versionId: "v1",
            name: "Grid",
            runtimeVersion: "",
            manifest: {},
            code: "bot()",
            settingsForm: [],
            valid: true,
            createdAt: 1_700_000_000_000,
            flow: null,
        });
        expect(transport.lastCall()?.message).toEqual({ versionId: "v1" });
    });

    it("starts a backtest with epoch-ms window bounds and reads it back with base58 IDs", async () => {
        const { transport, service } = serviceWith({
            startBacktest: {
                backtestId: 42n,
                status: Proto.Backtest_Status.QUEUED,
                estimatedSeconds: 30,
            },
            getBacktest: {
                backtest: create(Proto.BacktestSchema, {
                    backtestId: 42n,
                    versionId: "v1",
                    status: Proto.Backtest_Status.DONE,
                    createdAt: ts(1_700_000_000),
                    report: {
                        metrics: {
                            returnPercent: "-3.25",
                            trades: 4,
                            fees: { asset: "USDT", amount: "0.1" },
                        },
                        trades: [{ market: "BTC-USDT", side: Proto.OrderSide.SELL, price: "100" }],
                    },
                }),
            },
        });

        await expect(
            service.startBacktest({
                versionId: "v1",
                startTime: 1_700_000_000_000,
                settings: [{ name: "grid", value: "5" }],
                idempotencyKey: "bt-1",
            }),
        ).resolves.toEqual({ backtestId: formatId(42n), status: "queued", estimatedSeconds: 30 });
        expect(transport.lastCall()?.message).toMatchObject({
            versionId: "v1",
            startTime: { seconds: 1_700_000_000n, nanos: 0 },
            settings: [{ name: "grid", value: "5" }],
            initialBalances: [],
            idempotencyKey: "bt-1",
        });
        expect(transport.lastCall()?.message).not.toHaveProperty("endTime");

        const backtest = await service.getBacktest({ backtestId: formatId(42n) });
        expect(transport.lastCall()?.message).toEqual({ backtestId: 42n });
        expect(backtest).toMatchObject({
            backtestId: formatId(42n),
            status: "done",
            createdAt: 1_700_000_000_000,
            finishedAt: null,
            report: {
                metrics: {
                    returnPercent: "-3.25",
                    trades: 4,
                    fees: { asset: "USDT", amount: "0.1" },
                },
                trades: [{ market: "BTC-USDT", side: "sell", price: "100", fee: null }],
            },
        });
    });

    it("proposes a deploy funded from the main account unless a subaccount is given", async () => {
        const { transport, service } = serviceWith({
            proposeDeploy: create(Proto.ProposeDeployResponseSchema, {
                proposalId: 7n,
                deployUrl: "https://polyester.test/deploy/7",
                summary: {
                    versionId: "v1",
                    strategyId: 5n,
                    revision: 3n,
                    botName: "Grid",
                    funding: [{ asset: "USDT", amount: "50" }],
                },
            }),
        });
        const input = {
            strategyId: formatId(5n),
            revision: "3",
            botName: "Grid",
            funding: [{ asset: "USDT", amount: "50" }],
            idempotencyKey: "p-1",
        };

        const result = await service.proposeDeploy(input);
        expect(transport.lastCall()?.message).toMatchObject({
            strategyId: 5n,
            revision: 3n,
            fundingSubaccountId: 0n,
            settings: [],
        });
        expect(result).toMatchObject({
            proposalId: formatId(7n),
            deployUrl: "https://polyester.test/deploy/7",
            summary: {
                strategyId: formatId(5n),
                revision: "3",
                fundingSubaccountId: null,
                funding: [{ asset: "USDT", amount: "50" }],
            },
            expiresAt: null,
        });

        await service.proposeDeploy({ ...input, fundingSubaccountId: formatId(9n) });
        expect(transport.lastCall()?.message).toMatchObject({ fundingSubaccountId: 9n });
        await expect(service.proposeDeploy({ ...input, funding: [] })).rejects.toBeInstanceOf(
            ValidationError,
        );
        await expect(service.proposeDeploy({ ...input, revision: "0" })).rejects.toBeInstanceOf(
            ValidationError,
        );
    });

    it("reads deploy status with null IDs until the bot exists", async () => {
        const { service } = serviceWith({
            getDeployStatus: {
                status: create(Proto.DeployStatusSchema, {
                    proposalId: 7n,
                    state: Proto.DeployStatus_State.FUNDING,
                    step: "Funding the account…",
                }),
            },
        });

        await expect(service.getDeployStatus({ proposalId: formatId(7n) })).resolves.toMatchObject({
            proposalId: formatId(7n),
            state: "funding",
            botId: null,
            subaccountId: null,
            failedAt: "unspecified",
        });
    });

    it("reads a deploy proposal with its summary and status", async () => {
        const { transport, service } = serviceWith({
            getDeployProposal: create(Proto.GetDeployProposalResponseSchema, {
                proposalId: 7n,
                summary: { versionId: "v1", botName: "Grid" },
                status: {
                    proposalId: 7n,
                    state: Proto.DeployStatus_State.FAILED,
                    failedAt: Proto.DeployStatus_State.FUNDING,
                },
                fundingSubaccountLabel: "Savings",
            }),
        });

        await expect(
            service.getDeployProposal({ proposalId: formatId(7n) }),
        ).resolves.toMatchObject({
            proposalId: formatId(7n),
            summary: { versionId: "v1", strategyId: null, revision: null },
            status: { state: "failed", failedAt: "funding" },
            createdAt: null,
            fundingSubaccountLabel: "Savings",
        });
        expect(transport.lastCall()?.message).toEqual({ proposalId: 7n });
    });

    it("lists bots and bot logs with their page tokens", async () => {
        const { transport, service } = serviceWith({
            listBots: {
                bots: [
                    create(Proto.BotSchema, {
                        botId: 3n,
                        subaccountId: 4n,
                        status: Proto.Bot_Status.PAUSED,
                        pauseReason: Proto.Bot_PauseReason.FAILURES_IN_A_ROW,
                        profitAndLoss: "-12.5",
                        markets: ["BTC/USDT"],
                        funding: {
                            subaccountId: 6n,
                            subaccountLabel: "Savings",
                            initialFunding: [{ asset: "USDT", amount: "200" }],
                        },
                        uptimeRatio: "0.9875",
                    }),
                    create(Proto.BotSchema, {
                        botId: 5n,
                        funding: { subaccountId: 0n, subaccountLabel: "Main" },
                    }),
                ],
                nextPageToken: "next",
                statusCounts: [
                    create(Proto.BotStatusCountSchema, {
                        status: Proto.Bot_Status.PAUSED,
                        count: 1,
                    }),
                ],
            },
            listBotLogs: {
                entries: [
                    create(Proto.BotLogEntrySchema, {
                        sequence: 9n,
                        kind: Proto.BotLogEntry_Kind.ERROR,
                        message: "boom",
                    }),
                ],
                nextPageToken: "",
            },
        });

        await expect(service.listBots({ limit: 10 })).resolves.toEqual({
            bots: [
                expect.objectContaining({
                    botId: formatId(3n),
                    subaccountId: formatId(4n),
                    status: "paused",
                    pauseReason: "failures_in_a_row",
                    profitAndLoss: "-12.5",
                    markets: ["BTC/USDT"],
                    funding: {
                        subaccountId: formatId(6n),
                        subaccountLabel: "Savings",
                        initialFunding: [{ asset: "USDT", amount: "200" }],
                    },
                    uptimeRatio: "0.9875",
                    runningSince: null,
                }),
                expect.objectContaining({
                    botId: formatId(5n),
                    funding: expect.objectContaining({ subaccountId: null }),
                }),
            ],
            nextPageToken: "next",
            statusCounts: [{ status: "paused", count: 1 }],
        });
        await expect(
            service.listBotLogs({ botId: formatId(3n), startTime: 1_000, pageToken: " p " }),
        ).resolves.toEqual({
            entries: [{ sequence: "9", time: null, kind: "error", message: "boom" }],
            nextPageToken: "",
        });
        expect(transport.lastCall()?.message).toEqual({
            botId: 3n,
            startTime: { seconds: 1n, nanos: 0 },
            pageToken: "p",
        });
        await expect(service.listBots({ limit: 201 })).rejects.toBeInstanceOf(ValidationError);
    });

    it("lists the versions a bot ran", async () => {
        const { transport, service } = serviceWith({
            listBotVersions: create(Proto.ListBotVersionsResponseSchema, {
                versions: [{ versionId: "v1", name: "Grid", startedAt: ts(1_700_000_000) }],
                nextPageToken: "next",
            }),
        });

        await expect(service.listBotVersions({ botId: formatId(3n), limit: 5 })).resolves.toEqual({
            versions: [
                {
                    versionId: "v1",
                    name: "Grid",
                    runtimeVersion: "",
                    startedAt: 1_700_000_000_000,
                    stoppedAt: null,
                },
            ],
            nextPageToken: "next",
        });
        expect(transport.lastCall()?.message).toEqual({ botId: 3n, limit: 5, pageToken: "" });
    });

    it("stops a bot in the requested mode", async () => {
        const { transport, service } = serviceWith({
            stopBot: create(Proto.StopBotResponseSchema, {
                bot: { botId: 3n, status: Proto.Bot_Status.STOPPING },
                mode: Proto.StopMode.CANCEL_ORDERS,
            }),
        });

        await expect(
            service.stopBot({ botId: formatId(3n), mode: "cancel_orders", idempotencyKey: "s-1" }),
        ).resolves.toMatchObject({
            bot: { botId: formatId(3n), status: "stopping" },
            mode: "cancel_orders",
        });
        expect(transport.lastCall()?.message).toEqual({
            botId: 3n,
            mode: Proto.StopMode.CANCEL_ORDERS,
            idempotencyKey: "s-1",
        });
        await expect(
            // @ts-expect-error: an unknown mode is rejected before the call
            service.stopBot({ botId: formatId(3n), mode: "pause", idempotencyKey: "s-1" }),
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("maps a draft revision conflict to a RevisionConflictError with the current revision", async () => {
        const service = rejectingService(Code.FailedPrecondition, {
            code: Proto.ErrorCode.DRAFT_REVISION_CONFLICT,
            revisionConflict: { revision: 4n, headVersionId: "v4" },
        });
        const rejected = service.saveDraftVersion({
            strategyId: formatId(5n),
            expectedRevision: "3",
            name: "Grid",
            manifest: {},
            code: "",
        });
        await expect(rejected).rejects.toBeInstanceOf(RevisionConflictError);
        await expect(rejected).rejects.toMatchObject({
            detail: {
                service: "strategies",
                code: "DRAFT_REVISION_CONFLICT",
                revisionConflict: { revision: "4", headVersionId: "v4" },
            },
        });
    });

    it("surfaces the strategy cap in the strategies detail", async () => {
        const service = rejectingService(Code.FailedPrecondition, {
            code: Proto.ErrorCode.STRATEGY_CAP_REACHED,
            strategyCap: { strategyCap: 100, strategies: 100 },
        });
        await expect(service.create({ name: "Grid", idempotencyKey: "c-1" })).rejects.toMatchObject(
            {
                detail: {
                    code: "STRATEGY_CAP_REACHED",
                    strategyCap: { strategyCap: 100, strategies: 100 },
                },
            },
        );
    });

    it("surfaces a refused deploy's shortfall in the strategies detail", async () => {
        const service = rejectingService(Code.FailedPrecondition, {
            code: Proto.ErrorCode.INSUFFICIENT_FUNDS,
            shortfall: [{ asset: "USDT", amount: "12.5" }],
        });
        const rejected = service.proposeDeploy({
            strategyId: formatId(5n),
            revision: "1",
            botName: "Grid",
            funding: [{ asset: "USDT", amount: "50" }],
            idempotencyKey: "p-1",
        });
        await expect(rejected).rejects.toBeInstanceOf(PreconditionFailedError);
        await expect(rejected).rejects.toMatchObject({
            detail: {
                service: "strategies",
                code: "INSUFFICIENT_FUNDS",
                shortfall: [{ asset: "USDT", amount: "12.5" }],
            },
        });
    });

    it("maps the backtest limit to a RateLimitError that waits for the detail's retryAfter", async () => {
        vi.useFakeTimers({ now: 1_700_000_000_000 });
        const service = rejectingService(Code.ResourceExhausted, {
            code: Proto.ErrorCode.BACKTEST_LIMIT_REACHED,
            retryAfter: ts(1_700_003_600),
        });
        const rejected = service.startBacktest({ versionId: "v1", idempotencyKey: "bt-1" });
        await expect(rejected).rejects.toBeInstanceOf(RateLimitError);
        await expect(rejected).rejects.toMatchObject({
            retryAfterMs: 3_600_000,
            detail: { code: "BACKTEST_LIMIT_REACHED", retryAfter: 1_700_003_600_000 },
        });
    });

    it.each([
        [
            Code.ResourceExhausted,
            Proto.ErrorCode.INDICATOR_SETTINGS_LIMIT_REACHED,
            PreconditionFailedError,
        ],
        [Code.AlreadyExists, Proto.ErrorCode.IDEMPOTENCY_CONFLICT, AlreadyExistsError],
    ])("maps %s %s to its typed error", async (code, strategiesCode, type) => {
        const service = rejectingService(code, { code: strategiesCode });
        await expect(
            service.startBacktest({ versionId: "v1", idempotencyKey: "bt-1" }),
        ).rejects.toBeInstanceOf(type);
    });
});
