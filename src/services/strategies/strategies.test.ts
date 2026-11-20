import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import {
    AlreadyExistsError,
    PreconditionFailedError,
    RateLimitError,
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

    it("validates a strategy and returns its issues as data, not an error", async () => {
        const manifest = { settings: [], events: ["candle"] };
        const { transport, service } = serviceWith({
            validateStrategy: create(Proto.ValidateStrategyResponseSchema, {
                versionId: "v1",
                runtimeVersion: "1",
                valid: false,
                errors: [{ line: 3, column: 7, rule: "syntax", message: "unexpected token" }],
                moneyCard: { budget: { asset: "USDT", amount: "50" }, markets: ["BTC-USDT"] },
            }),
        });

        const result = await service.validate({ name: " Grid ", manifest, code: "bot()" });

        expect(transport.lastCall()?.method.name).toBe("ValidateStrategy");
        expect(transport.lastCall()?.message).toEqual({
            name: "Grid",
            manifest,
            code: "bot()",
            runtimeVersion: "",
        });
        expect(result).toMatchObject({
            versionId: "v1",
            valid: false,
            errors: [{ manifestPath: "", line: 3, column: 7, rule: "syntax" }],
            moneyCard: {
                budget: { asset: "USDT", amount: "50" },
                maxOrder: null,
                markets: ["BTC-USDT"],
            },
        });
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
                    botName: "Grid",
                    funding: [{ asset: "USDT", amount: "50" }],
                },
            }),
        });
        const input = {
            versionId: "v1",
            botName: "Grid",
            funding: [{ asset: "USDT", amount: "50" }],
            idempotencyKey: "p-1",
        };

        const result = await service.proposeDeploy(input);
        expect(transport.lastCall()?.message).toMatchObject({
            fundingSubaccountId: 0n,
            settings: [],
        });
        expect(result).toMatchObject({
            proposalId: formatId(7n),
            deployUrl: "https://polyester.test/deploy/7",
            summary: { fundingSubaccountId: null, funding: [{ asset: "USDT", amount: "50" }] },
            expiresAt: null,
        });

        await service.proposeDeploy({ ...input, fundingSubaccountId: formatId(9n) });
        expect(transport.lastCall()?.message).toMatchObject({ fundingSubaccountId: 9n });
        await expect(service.proposeDeploy({ ...input, funding: [] })).rejects.toBeInstanceOf(
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
        });
    });

    it("lists bots and bot logs with their page tokens", async () => {
        const { transport, service } = serviceWith({
            listBots: {
                bots: [
                    create(Proto.BotSchema, {
                        botId: 3n,
                        subaccountId: 4n,
                        status: Proto.Bot_Status.QUARANTINED,
                        profitAndLoss: "-12.5",
                    }),
                ],
                nextPageToken: "next",
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
                    status: "quarantined",
                    profitAndLoss: "-12.5",
                }),
            ],
            nextPageToken: "next",
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

    it("surfaces a refused deploy's shortfall in the strategies detail", async () => {
        const service = rejectingService(Code.FailedPrecondition, {
            code: Proto.ErrorCode.INSUFFICIENT_FUNDS,
            shortfall: [{ asset: "USDT", amount: "12.5" }],
        });
        const rejected = service.proposeDeploy({
            versionId: "v1",
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
