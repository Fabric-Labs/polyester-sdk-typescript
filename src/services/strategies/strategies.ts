import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { BotStatusCodec } from "./strategies.codecs.js";
import {
    BacktestIdInputSchema,
    BotIdInputSchema,
    CreateStrategyInputSchema,
    DeployProposalInputSchema,
    GetStrategyReferenceInputSchema,
    ListBotLogsInputSchema,
    ListBotVersionsInputSchema,
    ListBotsInputSchema,
    ListStrategiesInputSchema,
    ListStrategyRevisionsInputSchema,
    ProposeDeployInputSchema,
    RenameStrategyInputSchema,
    SaveDraftVersionInputSchema,
    StartBacktestInputSchema,
    StopBotInputSchema,
    StrategyIdInputSchema,
    StrategyVersionInputSchema,
    formatBacktest,
    formatBot,
    formatBotDetails,
    formatBotLogEntry,
    formatBotVersion,
    formatCreateStrategyResult,
    formatDeployProposal,
    formatDeployStatus,
    formatExplainStrategyResult,
    formatProposeDeployResult,
    formatRenameStrategyResult,
    formatRunScenariosResult,
    formatSaveDraftVersionResult,
    formatStartBacktestResult,
    formatStopBotResult,
    formatStrategy,
    formatStrategyDetails,
    formatStrategyReference,
    formatStrategyRevision,
    formatStrategyTemplate,
    formatStrategyVersion,
    type CreateStrategyInput,
    type CreateStrategyResult,
    type ExplainStrategyResult,
    type GetStrategyReferenceInput,
    type ListBotLogsInput,
    type ListBotVersionsInput,
    type ListBotsInput,
    type ListStrategiesInput,
    type ListStrategiesResult,
    type ListStrategyBotLogsResult,
    type ListStrategyBotVersionsResult,
    type ListStrategyBotsResult,
    type ListStrategyRevisionsInput,
    type ListStrategyRevisionsResult,
    type ProposeDeployInput,
    type ProposeStrategyDeployResult,
    type RenameStrategyInput,
    type RunStrategyScenariosResult,
    type SaveDraftVersionInput,
    type SaveDraftVersionResult,
    type StartBacktestInput,
    type StartStrategyBacktestResult,
    type StopBotInput,
    type StopStrategyBotResult,
    type Strategy,
    type StrategyBacktest,
    type StrategyBacktestInput,
    type StrategyBotDetails,
    type StrategyBotInput,
    type StrategyDeployProposal,
    type StrategyDeployProposalInput,
    type StrategyDeployStatus,
    type StrategyDetails,
    type StrategyInput,
    type StrategyReference,
    type StrategyTemplate,
    type StrategyVersion,
    type StrategyVersionInput,
} from "./strategies.schemas.js";

/**
 * Writes, tests and proposes trading bots of the caller's main account: save drafts of a strategy
 * as immutable versions, run their behaviour examples, backtest them, then record a deploy
 * proposal the user deploys on the website with MFA and a wallet signature, and stop bots. Nothing
 * here deploys a bot, creates a subaccount or moves funds. API keys need `read-strategies`,
 * `draft-strategies`, `propose-strategy-deploy` or `stop-strategies`, and a key scoped to a
 * subaccount is refused (`PermissionError`).
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
     * Creates a strategy: blank, from a template (`templateId`) or as a copy of one of the
     * caller's versions (`versionId`), the latter two saved as revision 1. The strategy cap
     * throws `PreconditionFailedError` (`STRATEGY_CAP_REACHED`, with `strategyCap`); an unknown
     * source throws `ResourceNotFoundError` (`TEMPLATE_NOT_FOUND`, `VERSION_NOT_FOUND`); reusing
     * `idempotencyKey` for another request throws `AlreadyExistsError`. Needs `draft-strategies`.
     */
    async create(
        input: CreateStrategyInput,
        options?: PolyesterRequestOptions,
    ): Promise<CreateStrategyResult> {
        const request = parse(CreateStrategyInputSchema, input);
        const res = await this.#client.createStrategy(request, toConnectCallOptions(options));
        return formatCreateStrategyResult(res);
    }

    /**
     * Checks a bot and saves it as the strategy's next revision, renaming the strategy to `name`.
     * A bot with mistakes is saved too, with `valid: false` and its `errors`. A stale
     * `expectedRevision` throws `RevisionConflictError` (`DRAFT_REVISION_CONFLICT`, with
     * `revisionConflict`): read the strategy again and reapply the change. Needs
     * `draft-strategies`.
     */
    async saveDraftVersion(
        input: SaveDraftVersionInput,
        options?: PolyesterRequestOptions,
    ): Promise<SaveDraftVersionResult> {
        const request = parse(SaveDraftVersionInputSchema, input);
        const res = await this.#client.saveDraftVersion(request, toConnectCallOptions(options));
        return formatSaveDraftVersionResult(res);
    }

    /**
     * Reads a strategy and its current revision's version. An unknown strategy throws
     * `ResourceNotFoundError` (`STRATEGY_NOT_FOUND`). Needs `read-strategies`.
     */
    async get(input: StrategyInput, options?: PolyesterRequestOptions): Promise<StrategyDetails> {
        const request = parse(StrategyIdInputSchema, input);
        const res = await this.#client.getStrategy(request, toConnectCallOptions(options));
        return formatStrategyDetails(res);
    }

    /** Lists the caller's strategies, most recently saved or renamed first. Needs `read-strategies`. */
    async list(
        input: ListStrategiesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListStrategiesResult> {
        const request = parse(ListStrategiesInputSchema, input);
        const res = await this.#client.listStrategies(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return { strategies: res.strategies.map(formatStrategy), nextPageToken: res.nextPageToken };
    }

    /**
     * Lists a strategy's saved drafts, newest first. An unknown strategy throws `ResourceNotFoundError`
     * (`STRATEGY_NOT_FOUND`). Needs `read-strategies`.
     */
    async listRevisions(
        input: ListStrategyRevisionsInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListStrategyRevisionsResult> {
        const request = parse(ListStrategyRevisionsInputSchema, input);
        const res = await this.#client.listStrategyRevisions(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            revisions: res.revisions.map(formatStrategyRevision),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Renames a strategy; its revisions stay as they are. An unknown strategy throws
     * `ResourceNotFoundError` (`STRATEGY_NOT_FOUND`). Needs `draft-strategies`.
     */
    async rename(input: RenameStrategyInput, options?: PolyesterRequestOptions): Promise<Strategy> {
        const request = parse(RenameStrategyInputSchema, input);
        const res = await this.#client.renameStrategy(request, toConnectCallOptions(options));
        return formatRenameStrategyResult(res);
    }

    /**
     * Deletes a strategy and its revisions; it never stops a bot. A strategy a running bot or a
     * waiting proposal uses throws `PreconditionFailedError` (`STRATEGY_IN_USE`); an unknown one
     * throws `ResourceNotFoundError` (`STRATEGY_NOT_FOUND`). Needs `draft-strategies`.
     */
    async delete(input: StrategyInput, options?: PolyesterRequestOptions): Promise<void> {
        const request = parse(StrategyIdInputSchema, input);
        await this.#client.deleteStrategy(request, toConnectCallOptions(options));
    }

    /**
     * Reads a version's manifest, code and settings form, to start a new strategy from it. An
     * unknown or expired version throws `ResourceNotFoundError` (`VERSION_NOT_FOUND`). Needs
     * `read-strategies`.
     */
    async getVersion(
        input: StrategyVersionInput,
        options?: PolyesterRequestOptions,
    ): Promise<StrategyVersion> {
        const request = parse(StrategyVersionInputSchema, input);
        const res = await this.#client.getStrategyVersion(request, toConnectCallOptions(options));
        return formatStrategyVersion(res);
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
     * Records an immutable deploy proposal of a strategy's revision and returns the `deployUrl`
     * where the user deploys it with MFA and a wallet signature; it never deploys or moves funds.
     * Refusals throw `PreconditionFailedError` with the reason in the detail, for example
     * `SCENARIOS_FAILING`, `INSUFFICIENT_FUNDS` (with `shortfall`) or `BOT_CAP_REACHED` (with
     * `botCap`); an unknown strategy or revision throws `ResourceNotFoundError` (`STRATEGY_NOT_FOUND`,
     * `REVISION_NOT_FOUND`). Needs `propose-strategy-deploy`.
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

    /**
     * Reads a deploy proposal as its deploy page shows it: what the user approves, and where the
     * proposal is. An unknown proposal throws `ResourceNotFoundError` (`PROPOSAL_NOT_FOUND`). Needs
     * `read-strategies`.
     */
    async getDeployProposal(
        input: StrategyDeployProposalInput,
        options?: PolyesterRequestOptions,
    ): Promise<StrategyDeployProposal> {
        const request = parse(DeployProposalInputSchema, input);
        const res = await this.#client.getDeployProposal(request, toConnectCallOptions(options));
        return formatDeployProposal(res);
    }

    /** Lists the caller's bots, newest first, with how many are in each status. Needs `read-strategies`. */
    async listBots(
        input: ListBotsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListStrategyBotsResult> {
        const request = parse(ListBotsInputSchema, input);
        const res = await this.#client.listBots(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            bots: res.bots.map(formatBot),
            nextPageToken: res.nextPageToken,
            statusCounts: res.statusCounts.map((c) => ({
                status: enumLabel(BotStatusCodec.protoToOutput, c.status),
                count: c.count,
            })),
        };
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

    /**
     * Lists the versions a bot ran, newest run first. An unknown bot throws `ResourceNotFoundError`
     * (`BOT_NOT_FOUND`). Needs `read-strategies`.
     */
    async listBotVersions(
        input: ListBotVersionsInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListStrategyBotVersionsResult> {
        const request = parse(ListBotVersionsInputSchema, input);
        const res = await this.#client.listBotVersions(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return { versions: res.versions.map(formatBotVersion), nextPageToken: res.nextPageToken };
    }

    /**
     * Stops a bot: it makes no new decisions, and `keep_orders` leaves its open orders with its
     * subaccount while `cancel_orders` cancels them. The bot reads `stopping` until the stop
     * completes; poll `getBot`. A stopped bot throws `PreconditionFailedError`
     * (`BOT_NOT_RUNNING`), as does one already stopping in the other mode
     * (`BOT_ALREADY_STOPPING`); reusing `idempotencyKey` for another request throws
     * `AlreadyExistsError`. Needs `stop-strategies`.
     */
    async stopBot(
        input: StopBotInput,
        options?: PolyesterRequestOptions,
    ): Promise<StopStrategyBotResult> {
        const request = parse(StopBotInputSchema, input);
        const res = await this.#client.stopBot(request, toConnectCallOptions(options));
        return formatStopBotResult(res);
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
