import { create, isFieldSet } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import {
    AlreadyExistsError,
    PreconditionFailedError,
    RateLimitError,
    ResourceNotFoundError,
    RevisionConflictError,
    SessionElevationRequiredError,
    ValidationError,
} from "../../shared/errors.js";
import { rejectingUnaryTransport, unaryTransportByMethod } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { isSessionElevationRequiredError } from "../../utils/connect-mfa-errors.js";
import { StrategiesService } from "./strategies.js";

const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

function serviceWith(responses: Record<string, Record<string, unknown>>) {
    const transport = unaryTransportByMethod(responses);
    return {
        transport,
        service: new StrategiesService({
            authApi: transport.transport,
            publicApi: transport.transport,
        }),
    };
}

function rejectingService(
    code: Code,
    detail: Parameters<typeof create<typeof Proto.ErrorDetailSchema>>[1],
) {
    const error = new ConnectError("rejected", code, undefined, [
        { desc: Proto.ErrorDetailSchema, value: create(Proto.ErrorDetailSchema, detail) },
    ]);
    const transport = createErrorMappingTransport(rejectingUnaryTransport(error));
    return new StrategiesService({ authApi: transport, publicApi: transport });
}

describe("StrategiesService", () => {
    it("sends the public reads without credentials and everything else authenticated", async () => {
        const authApi = unaryTransportByMethod({ listStrategies: { strategies: [] } });
        const publicApi = unaryTransportByMethod({
            getStrategyReference: create(Proto.GetStrategyReferenceResponseSchema),
            listStrategyTemplates: { templates: [] },
            listCommunityStrategies: { strategies: [] },
            getCommunityStrategy: {
                strategy: create(Proto.CommunityStrategySchema, { listingId: 1n }),
            },
        });
        const service = new StrategiesService({
            authApi: authApi.transport,
            publicApi: publicApi.transport,
        });

        await service.getReference();
        await service.listTemplates();
        await service.listCommunity();
        await service.getCommunity({ listingId: formatId(1n) });
        await service.list();

        expect(publicApi.calls.map((c) => c.method.localName)).toEqual([
            "getStrategyReference",
            "listStrategyTemplates",
            "listCommunityStrategies",
            "getCommunityStrategy",
        ]);
        expect(authApi.calls.map((c) => c.method.localName)).toEqual(["listStrategies"]);
    });

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
                    markets: ["BTC/USDT"],
                    summary: "Buys dips",
                },
                head: { versionId: "v3", code: "bot()", manifest: { name: "Grid" } },
                notes: { strategyId: 5n },
            }),
        });

        await expect(service.get({ strategyId: formatId(5n) })).resolves.toMatchObject({
            strategy: {
                revision: "3",
                origin: { kind: "duplicate", sourceVersionId: "v0" },
                bot: { botId: formatId(3n), status: "running" },
                markets: ["BTC/USDT"],
                summary: "Buys dips",
            },
            head: { versionId: "v3", code: "bot()", manifest: { name: "Grid" }, createdAt: null },
            notes: { strategyId: formatId(5n), notesRevision: "0", savedAt: null },
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
                validation: { versionId: "v1", valid: true },
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
            validation: expect.objectContaining({
                versionId: "v1",
                valid: true,
                errors: [],
                moneyCard: null,
            }),
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

    it("deploys a proposal with or without subaccount authorization", async () => {
        const { transport, service } = serviceWith({
            deployBot: {
                status: create(Proto.DeployStatusSchema, {
                    proposalId: 7n,
                    state: Proto.DeployStatus_State.DEPLOYING,
                    step: "Starting the bot…",
                    botId: 42n,
                    subaccountId: 99n,
                }),
            },
        });

        await expect(service.deployBot({ proposalId: formatId(7n) })).resolves.toMatchObject({
            proposalId: formatId(7n),
            state: "deploying",
            step: "Starting the bot…",
            botId: formatId(42n),
            subaccountId: formatId(99n),
        });
        expect(transport.lastCall()?.message).toEqual({ proposalId: 7n });

        const auth = {
            smartAccountAddress: "0x1111111111111111111111111111111111111111",
            message: "Authorize bot subaccount",
            signature: "0xsig",
        };
        await service.deployBot({ proposalId: formatId(7n), subaccountAuthorization: auth });
        expect(transport.lastCall()?.message).toEqual({
            proposalId: 7n,
            subaccountAuthorization: auth,
        });
    });

    it("rejects invalid deployBot subaccount authorization before calling the transport", async () => {
        const { transport, service } = serviceWith({});
        const proposalId = formatId(7n);

        await expect(
            service.deployBot({
                proposalId,
                subaccountAuthorization: {
                    smartAccountAddress: "not-an-address",
                    message: "Authorize bot subaccount",
                    signature: "0xsig",
                },
            }),
        ).rejects.toBeInstanceOf(ValidationError);

        await expect(
            service.deployBot({
                proposalId,
                subaccountAuthorization: {
                    smartAccountAddress: "0x1111111111111111111111111111111111111111",
                    message: "Authorize bot subaccount",
                    signature: "",
                },
            }),
        ).rejects.toBeInstanceOf(ValidationError);

        expect(transport.lastCall()).toBeUndefined();
    });

    it("maps deployBot MFA_ELEVATION_REQUIRED to SessionElevationRequiredError", async () => {
        const service = rejectingService(Code.PermissionDenied, {
            code: Proto.ErrorCode.MFA_ELEVATION_REQUIRED,
        });
        const error = await service.deployBot({ proposalId: formatId(7n) }).catch((e) => e);
        expect(error).toBeInstanceOf(SessionElevationRequiredError);
        expect(error).toMatchObject({
            detail: { service: "strategies", code: "MFA_ELEVATION_REQUIRED" },
        });
        expect(isSessionElevationRequiredError(error)).toBe(true);
    });

    it("reads deploy status with null IDs until the bot exists", async () => {
        const { service } = serviceWith({
            getDeployStatus: {
                status: create(Proto.DeployStatusSchema, {
                    proposalId: 7n,
                    state: Proto.DeployStatus_State.SETTING_ACCESS,
                    step: "Setting the bot's limits…",
                }),
            },
        });

        await expect(service.getDeployStatus({ proposalId: formatId(7n) })).resolves.toMatchObject({
            proposalId: formatId(7n),
            state: "setting_access",
            botId: null,
            subaccountId: null,
            failedAt: "unspecified",
        });
    });

    it("reads a deploy proposal with its summary and status", async () => {
        const { transport, service } = serviceWith({
            getDeployProposal: create(Proto.GetDeployProposalResponseSchema, {
                proposalId: 7n,
                summary: {
                    versionId: "v1",
                    botName: "Grid",
                    notBacktestableReason: Proto.NotBacktestableReason.PLACES_LIMIT_ORDERS,
                },
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
            summary: {
                versionId: "v1",
                strategyId: null,
                revision: null,
                backtest: null,
                notBacktestableReason: "places_limit_orders",
            },
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
                        pauseReason: Proto.Bot_PauseReason.UNRECORDED_ORDER,
                        activity: [
                            { start: ts(1_700_000_000), decisions: 3, fills: 1, expired: 2 },
                        ],
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
                followToken: "follow",
                deployedAgain: true,
            },
        });

        await expect(service.listBots({ limit: 10 })).resolves.toEqual({
            bots: [
                expect.objectContaining({
                    botId: formatId(3n),
                    subaccountId: formatId(4n),
                    status: "paused",
                    pauseReason: "unrecorded_order",
                    activity: [{ start: 1_700_000_000_000, decisions: 3, fills: 1, expired: 2 }],
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
            followToken: "follow",
            deployedAgain: true,
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

    it("lists templates with the money card a version saved from them shows", async () => {
        const { service } = serviceWith({
            listStrategyTemplates: create(Proto.ListStrategyTemplatesResponseSchema, {
                templates: [{ templateId: "grid", moneyCard: { markets: ["BTC/USDT"] } }],
            }),
        });

        await expect(service.listTemplates()).resolves.toMatchObject([
            { templateId: "grid", moneyCard: { budget: null, markets: ["BTC/USDT"] } },
        ]);
    });

    it("reads a bot's decisions and errors; balances, open orders and P&L are read elsewhere", async () => {
        const { service } = serviceWith({
            getBot: create(Proto.GetBotResponseSchema, {
                bot: { botId: 3n, subaccountId: 4n, status: Proto.Bot_Status.RUNNING },
                decisions: [
                    {
                        decidedAt: ts(1_700_000_000),
                        event: "on_timer",
                        orders: [{ buy: "BTC/USDT", qty: "0.1" }],
                        logs: ["bought"],
                    },
                ],
                errors: [{ time: ts(1_700_000_060), event: "on_fill", message: "boom" }],
            }),
        });

        const details = await service.getBot({ botId: formatId(3n) });
        expect(Object.keys(details).sort()).toEqual([
            "bot",
            "decisions",
            "errors",
            "moneyCard",
            "settings",
        ]);
        expect(details.bot).not.toHaveProperty("profitAndLoss");
        expect(details.bot.activity).toEqual([]);
        expect(details.decisions).toEqual([
            {
                decidedAt: 1_700_000_000_000,
                event: "on_timer",
                orders: [{ buy: "BTC/USDT", qty: "0.1" }],
                logs: ["bought"],
            },
        ]);
        expect(details.errors).toEqual([
            { time: 1_700_000_060_000, event: "on_fill", message: "boom" },
        ]);
    });

    it("reads a finished backtest's grade, scenarios, equity curve and new metrics", async () => {
        const { service } = serviceWith({
            getBacktest: create(Proto.GetBacktestResponseSchema, {
                backtest: {
                    backtestId: 42n,
                    status: Proto.Backtest_Status.DONE,
                    attempts: 3,
                    report: {
                        evidenceGrade: Proto.EvidenceGrade.MEDIUM,
                        metrics: {
                            sharpeRatio: "1.4",
                            realizedPnl: "12.5",
                            maxDrawdownStart: ts(1_700_000_000),
                            startEquity: "1000",
                            endEquity: "1012.5",
                        },
                        heldBackMetrics: { returnPercent: "1" },
                        heldBackBaselines: [{ name: "cash" }],
                        scenarios: [{ name: "high", slippageBps: 25, metrics: {} }],
                        equity: [
                            { time: ts(1_700_000_000), equity: "1000", buyAndHoldEquity: "1000" },
                        ],
                        heldBackStart: ts(1_700_086_400),
                        windowMaxDrawdownPercent: "4.2",
                        heldBackSeen: true,
                        trades: [{ tradeIndex: 0n, realizedPnl: "", afterGap: true }],
                        dataGaps: [{ market: "BTC/USDT", affected: true }],
                    },
                },
            }),
        });

        const backtest = await service.getBacktest({ backtestId: formatId(42n) });
        expect(backtest).toMatchObject({
            status: "done",
            attempts: 3,
            notBacktestableReason: "unspecified",
            report: {
                evidenceGrade: "medium",
                metrics: {
                    sharpeRatio: "1.4",
                    realizedPnl: "12.5",
                    maxDrawdownStart: 1_700_000_000_000,
                    maxDrawdownEnd: null,
                    startEquity: "1000",
                    endEquity: "1012.5",
                },
                heldBackMetrics: { returnPercent: "1", sharpeRatio: null },
                heldBackBaselines: [{ name: "cash", metrics: null }],
                scenarios: [
                    {
                        name: "high",
                        slippageBps: 25,
                        metrics: { sharpeRatio: null },
                        heldBackMetrics: null,
                    },
                ],
                equity: [{ time: 1_700_000_000_000, equity: "1000", buyAndHoldEquity: "1000" }],
                heldBackStart: 1_700_086_400_000,
                windowMaxDrawdownPercent: "4.2",
                windowMaxDrawdownStart: null,
                heldBackSeen: true,
                trades: [{ tradeIndex: "0", realizedPnl: "", afterGap: true }],
                dataGaps: [{ market: "BTC/USDT", window: null, affected: true }],
            },
        });
        expect(backtest.report).not.toHaveProperty("attempts");
        expect(backtest.report).not.toHaveProperty("reportUrl");
    });

    it("reads a backtest that ended as not backtestable, with its reason", async () => {
        const { service } = serviceWith({
            getBacktest: create(Proto.GetBacktestResponseSchema, {
                backtest: {
                    backtestId: 42n,
                    status: Proto.Backtest_Status.NOT_BACKTESTABLE,
                    notBacktestableReason: Proto.NotBacktestableReason.PLACES_LIMIT_ORDERS,
                },
            }),
        });

        await expect(service.getBacktest({ backtestId: formatId(42n) })).resolves.toMatchObject({
            status: "not_backtestable",
            notBacktestableReason: "places_limit_orders",
            report: null,
        });
    });

    it("lists a strategy's backtests as headlines", async () => {
        const { transport, service } = serviceWith({
            listBacktests: create(Proto.ListBacktestsResponseSchema, {
                backtests: [
                    {
                        summary: {
                            backtestId: 42n,
                            status: Proto.Backtest_Status.DONE,
                            metrics: { returnPercent: "2.5" },
                            attempts: 2,
                        },
                        versionId: "v1",
                        revision: 3n,
                        window: { startTime: ts(1_700_000_000), endTime: ts(1_700_086_400) },
                        createdAt: ts(1_700_100_000),
                    },
                ],
                nextPageToken: "next",
            }),
        });

        await expect(
            service.listBacktests({ strategyId: formatId(5n), limit: 50 }),
        ).resolves.toEqual({
            backtests: [
                {
                    summary: {
                        backtestId: formatId(42n),
                        status: "done",
                        metrics: expect.objectContaining({ returnPercent: "2.5" }),
                        heldBackMetrics: null,
                        attempts: 2,
                    },
                    versionId: "v1",
                    revision: "3",
                    window: { startTime: 1_700_000_000_000, endTime: 1_700_086_400_000 },
                    createdAt: 1_700_100_000_000,
                    finishedAt: null,
                },
            ],
            nextPageToken: "next",
        });
        expect(transport.lastCall()?.method.name).toBe("ListBacktests");
        expect(transport.lastCall()?.message).toEqual({ strategyId: 5n, limit: 50, pageToken: "" });
        await expect(
            service.listBacktests({ strategyId: formatId(5n), limit: 51 }),
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("lists a backtest's trades a page at a time", async () => {
        const { transport, service } = serviceWith({
            listBacktestTrades: create(Proto.ListBacktestTradesResponseSchema, {
                trades: [
                    {
                        tradeIndex: 20n,
                        time: ts(1_700_000_000),
                        market: "BTC/USDT",
                        side: Proto.OrderSide.SELL,
                        price: "100",
                        quantity: "0.1",
                        fee: { asset: "USDT", amount: "0.01" },
                        reason: "take profit",
                        realizedPnl: "-0.75",
                    },
                ],
                nextPageToken: "next",
            }),
        });

        await expect(
            service.listBacktestTrades({
                backtestId: formatId(42n),
                limit: 1000,
                pageToken: "p",
            }),
        ).resolves.toEqual({
            trades: [
                {
                    tradeIndex: "20",
                    time: 1_700_000_000_000,
                    market: "BTC/USDT",
                    side: "sell",
                    price: "100",
                    quantity: "0.1",
                    fee: { asset: "USDT", amount: "0.01" },
                    reason: "take profit",
                    realizedPnl: "-0.75",
                    afterGap: false,
                },
            ],
            nextPageToken: "next",
        });
        expect(transport.lastCall()?.method.name).toBe("ListBacktestTrades");
        expect(transport.lastCall()?.message).toEqual({
            backtestId: 42n,
            limit: 1000,
            pageToken: "p",
        });
    });

    it("reads, saves and lists a strategy's notes", async () => {
        const notes = {
            strategyId: 5n,
            notesRevision: 2n,
            summary: "Buys dips",
            body: "# Plan\n",
            savedAt: ts(1_700_000_000),
            savedBy: Proto.StrategyRevision_SavedBy.API_KEY,
        };
        const formatted = {
            strategyId: formatId(5n),
            notesRevision: "2",
            summary: "Buys dips",
            body: "# Plan\n",
            savedAt: 1_700_000_000_000,
            savedBy: "api_key",
        };
        const { transport, service } = serviceWith({
            getStrategyNotes: create(Proto.GetStrategyNotesResponseSchema, { notes }),
            saveStrategyNotes: create(Proto.SaveStrategyNotesResponseSchema, { notes }),
            listStrategyNotesRevisions: create(Proto.ListStrategyNotesRevisionsResponseSchema, {
                revisions: [notes, { strategyId: 5n }],
                nextPageToken: "next",
            }),
        });

        await expect(service.getNotes({ strategyId: formatId(5n) })).resolves.toEqual(formatted);
        expect(transport.lastCall()?.method.name).toBe("GetStrategyNotes");
        expect(transport.lastCall()?.message).toEqual({ strategyId: 5n });

        await expect(
            service.saveNotes({
                strategyId: formatId(5n),
                expectedNotesRevision: "1",
                summary: "Buys dips",
                body: "# Plan\n",
            }),
        ).resolves.toEqual(formatted);
        expect(transport.lastCall()?.method.name).toBe("SaveStrategyNotes");
        expect(transport.lastCall()?.message).toEqual({
            strategyId: 5n,
            expectedNotesRevision: 1n,
            summary: "Buys dips",
            body: "# Plan\n",
        });
        expect(transport.lastCall()?.message).not.toHaveProperty("expectedRevision");

        await service.saveNotes({
            strategyId: formatId(5n),
            expectedNotesRevision: "0",
            summary: "",
            body: "",
            idempotencyKey: "n-1",
            expectedRevision: "0",
        });
        expect(transport.lastCall()?.message).toMatchObject({
            expectedNotesRevision: 0n,
            idempotencyKey: "n-1",
            expectedRevision: 0n,
        });

        await expect(
            service.listNotesRevisions({ strategyId: formatId(5n), limit: 20 }),
        ).resolves.toEqual({
            revisions: [
                formatted,
                {
                    strategyId: formatId(5n),
                    notesRevision: "0",
                    summary: "",
                    body: "",
                    savedAt: null,
                    savedBy: "unspecified",
                },
            ],
            nextPageToken: "next",
        });
        expect(transport.lastCall()?.method.name).toBe("ListStrategyNotesRevisions");
        expect(transport.lastCall()?.message).toEqual({ strategyId: 5n, limit: 20, pageToken: "" });
        await expect(
            service.listNotesRevisions({ strategyId: formatId(5n), limit: 21 }),
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("sends saveDraftVersion's expectedNotesRevision only when given, including zero", async () => {
        const { transport, service } = serviceWith({
            saveDraftVersion: create(Proto.SaveDraftVersionResponseSchema, {
                revision: 1n,
                version: { versionId: "v1" },
            }),
        });
        const input = {
            strategyId: formatId(6n),
            expectedRevision: "0",
            name: "Grid",
            manifest: {},
            code: "",
        };

        await service.saveDraftVersion(input);
        expect(transport.lastCall()?.message).not.toHaveProperty("expectedNotesRevision");

        await service.saveDraftVersion({ ...input, expectedNotesRevision: "0" });
        const message = transport.lastCall()?.message;
        expect(message).toMatchObject({ expectedNotesRevision: 0n });
        expect(
            isFieldSet(
                create(Proto.SaveDraftVersionRequestSchema, message),
                Proto.SaveDraftVersionRequestSchema.field.expectedNotesRevision,
            ),
        ).toBe(true);
    });

    it("maps a notes revision conflict to a RevisionConflictError with the notes' revision", async () => {
        const service = rejectingService(Code.FailedPrecondition, {
            code: Proto.ErrorCode.NOTES_REVISION_CONFLICT,
            notesConflict: { notesRevision: 4n },
        });
        const rejected = service.saveNotes({
            strategyId: formatId(5n),
            expectedNotesRevision: "3",
            summary: "",
            body: "",
        });
        await expect(rejected).rejects.toBeInstanceOf(RevisionConflictError);
        await expect(rejected).rejects.toMatchObject({
            detail: {
                service: "strategies",
                code: "NOTES_REVISION_CONFLICT",
                notesConflict: { notesRevision: "4" },
            },
        });
    });

    it("surfaces why a bot cannot be backtested, and only when the detail says", async () => {
        const rejected = rejectingService(Code.FailedPrecondition, {
            code: Proto.ErrorCode.NOT_BACKTESTABLE,
            notBacktestableReason: Proto.NotBacktestableReason.READS_VOLUME,
        }).startBacktest({ versionId: "v1", idempotencyKey: "bt-1" });
        await expect(rejected).rejects.toBeInstanceOf(PreconditionFailedError);
        await expect(rejected).rejects.toMatchObject({
            detail: { code: "NOT_BACKTESTABLE", notBacktestableReason: "reads_volume" },
        });

        const bare = rejectingService(Code.FailedPrecondition, {
            code: Proto.ErrorCode.NOT_BACKTESTABLE,
        }).startBacktest({ versionId: "v1", idempotencyKey: "bt-1" });
        await expect(bare).rejects.toSatisfy(
            (error: PreconditionFailedError) => !("notBacktestableReason" in (error.detail ?? {})),
        );
    });

    it("maps the limit on backtests at once to a RateLimitError with its use and no retryAfter", async () => {
        const service = rejectingService(Code.ResourceExhausted, {
            code: Proto.ErrorCode.BACKTEST_LIMIT_REACHED,
            backtestLimit: { dailyLimit: 200, dailyUsed: 12, activeLimit: 3, active: 3 },
        });
        const rejected = service.startBacktest({ versionId: "v1", idempotencyKey: "bt-1" });
        await expect(rejected).rejects.toBeInstanceOf(RateLimitError);
        await expect(rejected).rejects.toSatisfy(
            (error: RateLimitError) => !("retryAfter" in (error.detail ?? {})),
        );
        await expect(rejected).rejects.toMatchObject({
            detail: {
                code: "BACKTEST_LIMIT_REACHED",
                backtestLimit: { dailyLimit: 200, dailyUsed: 12, activeLimit: 3, active: 3 },
            },
        });
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

    it("rejects whitespace-padded or invalid idempotency keys on strategy writes without trimming", async () => {
        const { transport, service } = serviceWith({});

        for (const badKey of ["", "   ", " key-1 ", "bad key", "k".repeat(129)]) {
            await expect(
                service.create({ name: "Grid", idempotencyKey: badKey }),
            ).rejects.toBeInstanceOf(ValidationError);
            await expect(
                service.saveDraftVersion({
                    strategyId: formatId(6n),
                    expectedRevision: "0",
                    name: "Grid",
                    manifest: {},
                    code: "",
                    idempotencyKey: badKey,
                }),
            ).rejects.toBeInstanceOf(ValidationError);
            await expect(
                service.startBacktest({ versionId: "v1", idempotencyKey: badKey }),
            ).rejects.toBeInstanceOf(ValidationError);
            await expect(
                service.proposeDeploy({
                    strategyId: formatId(6n),
                    revision: "1",
                    botName: "Grid",
                    funding: [{ asset: "USDT", amount: "50" }],
                    idempotencyKey: badKey,
                }),
            ).rejects.toBeInstanceOf(ValidationError);
            await expect(
                service.stopBot({
                    botId: formatId(3n),
                    mode: "keep_orders",
                    idempotencyKey: badKey,
                }),
            ).rejects.toBeInstanceOf(ValidationError);
        }

        expect(transport.lastCall()).toBeUndefined();
    });

    it("sends valid saveDraftVersion idempotency keys unchanged and defaults omitted keys to empty", async () => {
        const { transport, service } = serviceWith({
            saveDraftVersion: create(Proto.SaveDraftVersionResponseSchema, {
                revision: 1n,
                version: {
                    versionId: "v1",
                    runtimeVersion: "2026-12",
                    valid: true,
                    errors: [],
                    flow: { nodes: [], edges: [], complete: true },
                },
            }),
        });

        await service.saveDraftVersion({
            strategyId: formatId(6n),
            expectedRevision: "0",
            name: "Grid",
            manifest: {},
            code: "",
        });
        expect(transport.lastCall()?.message).toMatchObject({ idempotencyKey: "" });

        await service.saveDraftVersion({
            strategyId: formatId(6n),
            expectedRevision: "1",
            name: "Grid",
            manifest: {},
            code: "",
            idempotencyKey: "draft_1:v2.0-rc",
        });
        expect(transport.lastCall()?.message).toMatchObject({ idempotencyKey: "draft_1:v2.0-rc" });
    });

    it("publishes a version with its tags and unpublishes the listing", async () => {
        const { transport, service } = serviceWith({
            publishStrategyVersion: create(Proto.PublishStrategyVersionResponseSchema, {
                listing: {
                    listingId: 9n,
                    state: Proto.StrategyListing_State.PUBLIC,
                    versionId: "v3",
                    publishedAt: ts(1_700_000_000),
                },
            }),
            unpublishStrategy: create(Proto.UnpublishStrategyResponseSchema, {
                listing: { listingId: 9n, state: Proto.StrategyListing_State.HIDDEN },
            }),
        });

        await expect(
            service.publishVersion({
                strategyId: formatId(5n),
                versionId: "v3",
                title: " Weekly DCA ",
                tags: ["dca", "trend"],
                idempotencyKey: "pub-1",
            }),
        ).resolves.toEqual({
            listingId: formatId(9n),
            state: "public",
            versionId: "v3",
            publishedAt: 1_700_000_000_000,
        });
        expect(transport.lastCall()?.method.name).toBe("PublishStrategyVersion");
        expect(transport.lastCall()?.message).toEqual({
            strategyId: 5n,
            versionId: "v3",
            title: "Weekly DCA",
            description: "",
            tags: [Proto.StrategyTag.DCA, Proto.StrategyTag.TREND],
            idempotencyKey: "pub-1",
        });
        await expect(
            service.publishVersion({
                strategyId: formatId(5n),
                versionId: "v3",
                title: "Weekly DCA",
                // @ts-expect-error not a strategy tag
                tags: ["unspecified"],
                idempotencyKey: "pub-1",
            }),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(1);

        await expect(service.unpublish({ listingId: formatId(9n) })).resolves.toMatchObject({
            state: "hidden",
            publishedAt: null,
        });
        expect(transport.lastCall()?.message).toEqual({ listingId: 9n });
    });

    it("lists community strategies with their backtest results and reads one with its report", async () => {
        const { transport, service } = serviceWith({
            listCommunityStrategies: create(Proto.ListCommunityStrategiesResponseSchema, {
                strategies: [
                    {
                        listingId: 9n,
                        title: "Weekly DCA",
                        tags: [Proto.StrategyTag.DCA],
                        markets: ["BTC-USDT"],
                        authorUsername: "ada",
                        backtest: {
                            status: Proto.Backtest_Status.DONE,
                            metrics: { returnPercent: "12.5" },
                        },
                    },
                ],
                nextPageToken: "next",
            }),
            getCommunityStrategy: create(Proto.GetCommunityStrategyResponseSchema, {
                strategy: {
                    listingId: 9n,
                    description: "Buys BTC every Monday.",
                    manifest: { name: "Weekly DCA" },
                    code: "bot()",
                    backtest: {
                        status: Proto.Backtest_Status.NOT_BACKTESTABLE,
                        notBacktestableReason: Proto.NotBacktestableReason.PLACES_LIMIT_ORDERS,
                    },
                },
            }),
        });

        await expect(
            service.listCommunity({ tags: ["dca", "grid"], markets: ["BTC-USDT"], limit: 20 }),
        ).resolves.toMatchObject({
            strategies: [
                {
                    listingId: formatId(9n),
                    tags: ["dca"],
                    authorUsername: "ada",
                    backtest: {
                        status: "done",
                        notBacktestableReason: "unspecified",
                        window: null,
                        metrics: { returnPercent: "12.5" },
                        report: null,
                    },
                    publishedAt: null,
                },
            ],
            nextPageToken: "next",
        });
        expect(transport.lastCall()?.message).toEqual({
            tags: [Proto.StrategyTag.DCA, Proto.StrategyTag.GRID],
            markets: ["BTC-USDT"],
            limit: 20,
            pageToken: "",
        });

        await service.listCommunity();
        expect(transport.lastCall()?.message).toEqual({ tags: [], markets: [], pageToken: "" });

        await expect(service.getCommunity({ listingId: formatId(9n) })).resolves.toMatchObject({
            listingId: formatId(9n),
            description: "Buys BTC every Monday.",
            tags: [],
            manifest: { name: "Weekly DCA" },
            moneyCard: null,
            flow: null,
            backtest: {
                status: "not_backtestable",
                notBacktestableReason: "places_limit_orders",
                metrics: null,
            },
        });
        expect(transport.lastCall()?.message).toEqual({ listingId: 9n });
    });

    it("reads a strategy's community listing and what a deploy waits for", async () => {
        const { service } = serviceWith({
            getStrategy: create(Proto.GetStrategyResponseSchema, {
                strategy: {
                    strategyId: 5n,
                    listing: {
                        listingId: 9n,
                        state: Proto.StrategyListing_State.HIDDEN,
                        versionId: "v3",
                    },
                },
            }),
            getDeployStatus: create(Proto.GetDeployStatusResponseSchema, {
                status: {
                    proposalId: 7n,
                    state: Proto.DeployStatus_State.FUNDING,
                    wait: {
                        reason: Proto.DeployWait_Reason.WHITELIST_REQUIRED,
                        address: "0x21a759df040a9b843de73092e59ac10ac17eb555",
                    },
                },
            }),
        });

        await expect(service.get({ strategyId: formatId(5n) })).resolves.toMatchObject({
            strategy: {
                listing: { listingId: formatId(9n), state: "hidden", versionId: "v3" },
            },
        });
        await expect(service.getDeployStatus({ proposalId: formatId(7n) })).resolves.toMatchObject({
            state: "funding",
            wait: {
                reason: "whitelist_required",
                address: "0x21a759df040a9b843de73092e59ac10ac17eb555",
            },
        });
    });

    it("surfaces community listing refusals with their typed errors and details", async () => {
        const publish = (service: StrategiesService) =>
            service.publishVersion({
                strategyId: formatId(5n),
                versionId: "v3",
                title: "Weekly DCA",
                idempotencyKey: "pub-1",
            });

        const capped = publish(
            rejectingService(Code.FailedPrecondition, {
                code: Proto.ErrorCode.LISTING_CAP_REACHED,
                listingCap: { listingCap: 20, listings: 20 },
            }),
        );
        await expect(capped).rejects.toBeInstanceOf(PreconditionFailedError);
        await expect(capped).rejects.toMatchObject({
            detail: {
                service: "strategies",
                code: "LISTING_CAP_REACHED",
                listingCap: { listingCap: 20, listings: 20 },
            },
        });

        // A daily limit that clears only when the UTC day resets: not a retryable rate limit.
        const limited = publish(
            rejectingService(Code.FailedPrecondition, {
                code: Proto.ErrorCode.PUBLISH_LIMIT_REACHED,
                retryAfter: ts(1_700_003_600),
            }),
        );
        await expect(limited).rejects.toBeInstanceOf(PreconditionFailedError);
        await expect(limited).rejects.toMatchObject({
            retryable: false,
            detail: { code: "PUBLISH_LIMIT_REACHED", retryAfter: 1_700_003_600_000 },
        });

        await expect(
            rejectingService(Code.NotFound, {
                code: Proto.ErrorCode.LISTING_NOT_FOUND,
            }).getCommunity({ listingId: formatId(9n) }),
        ).rejects.toBeInstanceOf(ResourceNotFoundError);
    });
});
