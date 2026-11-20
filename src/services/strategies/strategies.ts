import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    BacktestIdInputSchema,
    BotIdInputSchema,
    DeployProposalInputSchema,
    GetStrategyReferenceInputSchema,
    ListBotLogsInputSchema,
    ListBotsInputSchema,
    ProposeDeployInputSchema,
    StartBacktestInputSchema,
    StrategyVersionInputSchema,
    ValidateStrategyInputSchema,
    formatBacktest,
    formatBot,
    formatBotDetails,
    formatBotLogEntry,
    formatDeployStatus,
    formatExplainStrategyResult,
    formatProposeDeployResult,
    formatRunScenariosResult,
    formatStartBacktestResult,
    formatStrategyReference,
    formatStrategyTemplate,
    formatValidateStrategyResult,
    type ExplainStrategyResult,
    type GetStrategyReferenceInput,
    type ListBotLogsInput,
    type ListBotsInput,
    type ListStrategyBotLogsResult,
    type ListStrategyBotsResult,
    type ProposeDeployInput,
    type ProposeStrategyDeployResult,
    type RunStrategyScenariosResult,
    type StartBacktestInput,
    type StartStrategyBacktestResult,
    type StrategyBacktest,
    type StrategyBacktestInput,
    type StrategyBotDetails,
    type StrategyBotInput,
    type StrategyDeployProposalInput,
    type StrategyDeployStatus,
    type StrategyReference,
    type StrategyTemplate,
    type StrategyVersionInput,
    type ValidateStrategyInput,
    type ValidateStrategyResult,
} from "./strategies.schemas.js";

/**
 * Writes, tests and proposes trading bots of the caller's main account: validate a strategy into
 * an immutable version, run its behaviour examples, backtest it, then record a deploy proposal
 * the user deploys on the website with MFA and a wallet signature. Nothing here deploys a bot,
 * creates a subaccount or moves funds. API keys need `read-strategies`, `draft-strategies` or
 * `propose-strategy-deploy`, and a key scoped to a subaccount is refused (`PermissionError`).
 * Errors carry a `strategies` detail; a `ServiceUnavailableError` is safe to retry unchanged.
 */
export class StrategiesService {
    #client: Client<typeof Proto.StrategiesService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.StrategiesService, transports.authApi);
    }

    /**
     * What bot code is written against for one runtime version: the bot API reference and skill
     * pack, then the manifest's JSON Schema, the allowed indicators and the limits once the runtime
     * catalog is available. An unknown runtime version throws `ValidationError`
     * (`RUNTIME_VERSION_UNSUPPORTED`).
     */
    async getReference(
        input: GetStrategyReferenceInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<StrategyReference> {
        const request = parse(GetStrategyReferenceInputSchema, input);
        const res = await this.#client.getStrategyReference(request, toConnectCallOptions(options));
        return formatStrategyReference(res);
    }

    /** Lists the bot templates: starting points with a manifest and code. */
    async listTemplates(options?: PolyesterRequestOptions): Promise<StrategyTemplate[]> {
        const res = await this.#client.listStrategyTemplates({}, toConnectCallOptions(options));
        return res.templates.map(formatStrategyTemplate);
    }

    /**
     * Checks a bot and stores it as an immutable version. A bot with mistakes is no error: it
     * returns `valid: false` with its `errors`. Needs `draft-strategies`.
     */
    async validate(
        input: ValidateStrategyInput,
        options?: PolyesterRequestOptions,
    ): Promise<ValidateStrategyResult> {
        const request = parse(ValidateStrategyInputSchema, input);
        const res = await this.#client.validateStrategy(request, toConnectCallOptions(options));
        return formatValidateStrategyResult(res);
    }

    /**
     * Runs a version's behaviour examples against its code; a version always gets the same
     * result. Too many runs throw `RateLimitError` (`SCENARIO_RUN_LIMIT_REACHED`). Needs
     * `draft-strategies`.
     */
    async runScenarios(
        input: StrategyVersionInput,
        options?: PolyesterRequestOptions,
    ): Promise<RunStrategyScenariosResult> {
        const request = parse(StrategyVersionInputSchema, input);
        const res = await this.#client.runScenarios(request, toConnectCallOptions(options));
        return formatRunScenariosResult(res);
    }

    /**
     * Starts a backtest of a version; poll `getBacktest` until it is `done` or `failed`. The same
     * version, window, settings and balances return the existing backtest. The daily limit throws
     * `RateLimitError` (`BACKTEST_LIMIT_REACHED`); reusing `idempotencyKey` for another request
     * throws `AlreadyExistsError` (`IDEMPOTENCY_CONFLICT`). Needs `draft-strategies`.
     */
    async startBacktest(
        input: StartBacktestInput,
        options?: PolyesterRequestOptions,
    ): Promise<StartStrategyBacktestResult> {
        const request = parse(StartBacktestInputSchema, input);
        const res = await this.#client.startBacktest(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return formatStartBacktestResult(res);
    }

    /** Reads one backtest, with its report once `done`. Needs `read-strategies`. */
    async getBacktest(
        input: StrategyBacktestInput,
        options?: PolyesterRequestOptions,
    ): Promise<StrategyBacktest> {
        const request = parse(BacktestIdInputSchema, input);
        const res = await this.#client.getBacktest(request, toConnectCallOptions(options));
        if (!res.backtest) throw new Error("GetBacktest response is missing its backtest");
        return formatBacktest(res.backtest);
    }

    /**
     * The review summary of a version: what a user approves when deploying it. Needs
     * `read-strategies`.
     */
    async explain(
        input: StrategyVersionInput,
        options?: PolyesterRequestOptions,
    ): Promise<ExplainStrategyResult> {
        const request = parse(StrategyVersionInputSchema, input);
        const res = await this.#client.explainStrategy(request, toConnectCallOptions(options));
        return formatExplainStrategyResult(res);
    }

    /**
     * Records an immutable deploy proposal and returns the `deployUrl` where the user deploys it
     * with MFA and a wallet signature; it never deploys or moves funds. Refusals throw
     * `PreconditionFailedError` with the reason in the detail, for example `SCENARIOS_FAILING`,
     * `BACKTEST_MISSING`, `INSUFFICIENT_FUNDS` (with `shortfall`) or `BOT_CAP_REACHED` (with
     * `botCap`). Needs `propose-strategy-deploy`.
     */
    async proposeDeploy(
        input: ProposeDeployInput,
        options?: PolyesterRequestOptions,
    ): Promise<ProposeStrategyDeployResult> {
        const request = parse(ProposeDeployInputSchema, input);
        const res = await this.#client.proposeDeploy(request, toConnectCallOptions(options));
        return formatProposeDeployResult(res);
    }

    /**
     * Reads where a deploy proposal is; poll it until `live`, `failed` or `expired`. Needs
     * `read-strategies`.
     */
    async getDeployStatus(
        input: StrategyDeployProposalInput,
        options?: PolyesterRequestOptions,
    ): Promise<StrategyDeployStatus> {
        const request = parse(DeployProposalInputSchema, input);
        const res = await this.#client.getDeployStatus(request, toConnectCallOptions(options));
        if (!res.status) throw new Error("GetDeployStatus response is missing its status");
        return formatDeployStatus(res.status);
    }

    /** Lists the caller's bots, newest first. Needs `read-strategies`. */
    async listBots(
        input: ListBotsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListStrategyBotsResult> {
        const request = parse(ListBotsInputSchema, input);
        const res = await this.#client.listBots(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return { bots: res.bots.map(formatBot), nextPageToken: res.nextPageToken };
    }

    /**
     * Reads one bot: its money rules and settings, its subaccount's balances and open orders, and
     * its recent decisions and errors. Needs `read-strategies`.
     */
    async getBot(
        input: StrategyBotInput,
        options?: PolyesterRequestOptions,
    ): Promise<StrategyBotDetails> {
        const request = parse(BotIdInputSchema, input);
        const res = await this.#client.getBot(request, toConnectCallOptions(options));
        return formatBotDetails(res);
    }

    /** Reads a bot's log lines, decisions and errors, oldest first. Needs `read-strategies`. */
    async listBotLogs(
        input: ListBotLogsInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListStrategyBotLogsResult> {
        const request = parse(ListBotLogsInputSchema, input);
        const res = await this.#client.listBotLogs(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return { entries: res.entries.map(formatBotLogEntry), nextPageToken: res.nextPageToken };
    }
}
