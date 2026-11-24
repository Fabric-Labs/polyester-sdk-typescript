import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/strategies/v1/strategies_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthAndPublicApiTransports } from "../../shared/transports.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { BotStatusCodec } from "./strategies.codecs.js";
import {
    BacktestIdInputSchema,
    BotIdInputSchema,
    CreateStrategyInputSchema,
    DeployBotInputSchema,
    DeployProposalInputSchema,
    GetStrategyReferenceInputSchema,
    ListBacktestTradesInputSchema,
    ListCommunityStrategiesInputSchema,
    ListingIdInputSchema,
    ListBacktestsInputSchema,
    ListBotLogsInputSchema,
    ListBotVersionsInputSchema,
    ListBotsInputSchema,
    ListStrategiesInputSchema,
    ListStrategyNotesRevisionsInputSchema,
    ListStrategyRevisionsInputSchema,
    ProposeDeployInputSchema,
    PublishStrategyVersionInputSchema,
    RenameStrategyInputSchema,
    SaveDraftVersionInputSchema,
    SaveStrategyNotesInputSchema,
    StartBacktestInputSchema,
    StopBotInputSchema,
    StrategyIdInputSchema,
    StrategyVersionInputSchema,
    formatBacktest,
    formatBacktestTrade,
    formatBot,
    formatBotDetails,
    formatBotLogEntry,
    formatBotVersion,
    formatCommunityStrategy,
    formatCommunityStrategySummary,
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
    formatStrategyBacktestListItem,
    formatStrategyDetails,
    formatStrategyListing,
    formatStrategyNotes,
    formatStrategyReference,
    formatStrategyRevision,
    formatStrategyTemplate,
    formatStrategyVersion,
    type CommunityStrategy,
    type CreateStrategyInput,
    type CreateStrategyResult,
    type DeployBotInput,
    type ExplainStrategyResult,
    type GetStrategyReferenceInput,
    type ListBacktestTradesInput,
    type ListBacktestsInput,
    type ListBotLogsInput,
    type ListBotVersionsInput,
    type ListBotsInput,
    type ListCommunityStrategiesInput,
    type ListCommunityStrategiesResult,
    type ListStrategiesInput,
    type ListStrategiesResult,
    type ListStrategyBacktestTradesResult,
    type ListStrategyBacktestsResult,
    type ListStrategyBotLogsResult,
    type ListStrategyBotVersionsResult,
    type ListStrategyBotsResult,
    type ListStrategyNotesRevisionsInput,
    type ListStrategyNotesRevisionsResult,
    type ListStrategyRevisionsInput,
    type ListStrategyRevisionsResult,
    type ProposeDeployInput,
    type ProposeStrategyDeployResult,
    type PublishStrategyVersionInput,
    type RenameStrategyInput,
    type RunStrategyScenariosResult,
    type SaveDraftVersionInput,
    type SaveDraftVersionResult,
    type SaveStrategyNotesInput,
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
    type StrategyListing,
    type StrategyListingInput,
    type StrategyNotes,
    type StrategyReference,
    type StrategyTemplate,
    type StrategyVersion,
    type StrategyVersionInput,
} from "./strategies.schemas.js";

/**
 * Writes, tests, proposes and deploys trading bots of the caller's main account: save drafts of a
 * strategy as immutable versions, run their behaviour examples, backtest them, record a deploy
 * proposal, deploy it from the user's own MFA-elevated session with a wallet signature, and stop
 * bots. Publishes a strategy's version as its community listing, and browses the public listings.
 * API keys need `read-strategies`, `draft-strategies`, `propose-strategy-deploy` or
 * `stop-strategies`, and a key scoped to a subaccount is refused (`PermissionError`); `deployBot`
 * requires the user's own MFA-elevated session, and `publishVersion` and `unpublish` the user's
 * own session: both refuse API keys and connected-app sessions. `getReference`, `listTemplates`,
 * `listCommunity` and `getCommunity` need no credentials. Errors carry a `strategies` detail; a
 * `ServiceUnavailableError` is safe to retry unchanged.
 */
export class StrategiesService {
    #client: Client<typeof Proto.StrategiesService>;
    /** For the public reads, which take no credentials and may be cached as GETs. */
    #publicClient: Client<typeof Proto.StrategiesService>;

    constructor(transports: AuthAndPublicApiTransports) {
        this.#client = createClient(Proto.StrategiesService, transports.authApi);
        this.#publicClient = createClient(Proto.StrategiesService, transports.publicApi);
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
        const res = await this.#publicClient.getStrategyReference(
            request,
            toConnectCallOptions(options),
        );
        return formatStrategyReference(res);
    }

    /** Lists the bot templates: starting points with a manifest and code. */
    async listTemplates(options?: PolyesterRequestOptions): Promise<StrategyTemplate[]> {
        const res = await this.#publicClient.listStrategyTemplates(
            {},
            toConnectCallOptions(options),
        );
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
     * `revisionConflict`): read the strategy again and reapply the change. With
     * `expectedNotesRevision`, notes saved since also throw `RevisionConflictError`
     * (`NOTES_REVISION_CONFLICT`, with `notesConflict`). Needs `draft-strategies`.
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
     * Reads a strategy, its current revision's version and its notes. An unknown strategy throws
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
     * Reads a strategy's notes: its one-line summary and Markdown body as last saved, with
     * `notesRevision` `"0"` when never saved. An unknown strategy throws `ResourceNotFoundError`
     * (`STRATEGY_NOT_FOUND`). Needs `read-strategies`.
     */
    async getNotes(
        input: StrategyInput,
        options?: PolyesterRequestOptions,
    ): Promise<StrategyNotes> {
        const request = parse(StrategyIdInputSchema, input);
        const res = await this.#client.getStrategyNotes(request, toConnectCallOptions(options));
        if (!res.notes) throw new Error("GetStrategyNotes response is missing its notes");
        return formatStrategyNotes(res.notes);
    }

    /**
     * Saves a strategy's notes as their next revision; notes equal to the current ones add none
     * and return the current revision. A stale `expectedNotesRevision` throws
     * `RevisionConflictError` (`NOTES_REVISION_CONFLICT`, with `notesConflict`): read the notes
     * again, reapply the change and save with the new revision. A stale `expectedRevision` throws
     * `RevisionConflictError` (`DRAFT_REVISION_CONFLICT`); an unknown strategy throws
     * `ResourceNotFoundError` (`STRATEGY_NOT_FOUND`); reusing `idempotencyKey` for another request
     * throws `AlreadyExistsError`. Needs `draft-strategies`.
     */
    async saveNotes(
        input: SaveStrategyNotesInput,
        options?: PolyesterRequestOptions,
    ): Promise<StrategyNotes> {
        const request = parse(SaveStrategyNotesInputSchema, input);
        const res = await this.#client.saveStrategyNotes(request, toConnectCallOptions(options));
        if (!res.notes) throw new Error("SaveStrategyNotes response is missing its notes");
        return formatStrategyNotes(res.notes);
    }

    /**
     * Lists a strategy's saved notes, newest first, with how each was saved; every revision is
     * kept. An unknown strategy throws `ResourceNotFoundError` (`STRATEGY_NOT_FOUND`). Needs
     * `read-strategies`.
     */
    async listNotesRevisions(
        input: ListStrategyNotesRevisionsInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListStrategyNotesRevisionsResult> {
        const request = parse(ListStrategyNotesRevisionsInputSchema, input);
        const res = await this.#client.listStrategyNotesRevisions(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            revisions: res.revisions.map(formatStrategyNotes),
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
     * waiting proposal uses, or whose community listing is public, throws
     * `PreconditionFailedError` (`STRATEGY_IN_USE`); an unknown one throws `ResourceNotFoundError`
     * (`STRATEGY_NOT_FOUND`). Needs `draft-strategies`.
     */
    async delete(input: StrategyInput, options?: PolyesterRequestOptions): Promise<void> {
        const request = parse(StrategyIdInputSchema, input);
        await this.#client.deleteStrategy(request, toConnectCallOptions(options));
    }

    /**
     * Reads a version's manifest, code, settings form and stored check result, to start a new
     * strategy from it. An
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
     * Runs a version's behaviour examples against its code, on each market's trading rules as
     * they were when the version first ran; a version always gets the same result. A market not
     * listed on the exchange throws `PreconditionFailedError` (`VERSION_INVALID`); too many runs
     * throw `RateLimitError` (`SCENARIO_RUN_LIMIT_REACHED`). Needs `draft-strategies`.
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
     * Starts a backtest of a version; poll `getBacktest` until it is `done`, `failed` or
     * `not_backtestable`. The same version, window, settings and balances, under the same fee
     * rates and platform assumptions, return the existing backtest. A bot that cannot be
     * backtested throws `PreconditionFailedError` (`NOT_BACKTESTABLE`, with
     * `notBacktestableReason`). The daily limit throws `RateLimitError` (`BACKTEST_LIMIT_REACHED`)
     * that waits until the UTC day resets; the limit on backtests at once throws it without a
     * `retryAfter`, clearing when one finishes (`backtestLimit` says which). Reusing
     * `idempotencyKey` for another request throws `AlreadyExistsError` (`IDEMPOTENCY_CONFLICT`).
     * Needs `draft-strategies`.
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
     * Lists a strategy's backtests, newest first, each as a headline: those of the versions its
     * revisions saved, kept 30 days after they finish. An unknown strategy throws
     * `ResourceNotFoundError` (`STRATEGY_NOT_FOUND`). Needs `read-strategies`.
     */
    async listBacktests(
        input: ListBacktestsInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListStrategyBacktestsResult> {
        const request = parse(ListBacktestsInputSchema, input);
        const res = await this.#client.listBacktests(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            backtests: res.backtests.map(formatStrategyBacktestListItem),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Lists every trade of a finished backtest, a page at a time, in `tradeIndex` order. A
     * backtest not yet finished throws `PreconditionFailedError` (`BACKTEST_NOT_DONE`); an unknown
     * or expired one throws `ResourceNotFoundError` (`BACKTEST_NOT_FOUND`). Needs
     * `read-strategies`.
     */
    async listBacktestTrades(
        input: ListBacktestTradesInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListStrategyBacktestTradesResult> {
        const request = parse(ListBacktestTradesInputSchema, input);
        const res = await this.#client.listBacktestTrades(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return { trades: res.trades.map(formatBacktestTrade), nextPageToken: res.nextPageToken };
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
     * Deploys one deploy proposal of the caller from the user's own MFA-elevated session. API keys
     * and sessions a connected app holds on the user's behalf are refused (`PermissionError`); a
     * session without recent MFA throws `SessionElevationRequiredError` (`MFA_ELEVATION_REQUIRED`).
     * A deploy that creates a subaccount needs `subaccountAuthorization` signed via
     * `subaccounts.createChallenge` (otherwise throws `PreconditionFailedError` with
     * `SUBACCOUNT_AUTHORIZATION_REQUIRED`). Each call waits up to about 20 seconds; call again
     * while it answers `setting_access`, or `funding` without `wait`. With `wait`, do what it says
     * first, e.g. add `wait.address` to the internal whitelist. Safe to retry on timeout or error:
     * calling again continues the same deploy and never starts a second bot.
     */
    async deployBot(
        input: DeployBotInput,
        options?: PolyesterRequestOptions,
    ): Promise<StrategyDeployStatus> {
        const request = parse(DeployBotInputSchema, input);
        const res = await this.#client.deployBot(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        if (!res.status) throw new Error("DeployBot response is missing its status");
        return formatDeployStatus(res.status);
    }

    /**
     * Reads where a deploy proposal is, without advancing it. A deploy only moves on through
     * `deployBot`: while this reads `setting_access`, or `funding` once any `wait` is done, call
     * `deployBot` again; from `deploying`, polling this until `live`, `failed` or `expired` is
     * enough. Needs `read-strategies`.
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
     * Reads one bot: its money rules and settings, and its recent decisions and errors. Read its
     * subaccount's balances, open orders and profit and loss by its `subaccountId`, with
     * `balances.list`, `orders.listOpen` and `profitAndLoss.get`. Needs `read-strategies`.
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

    /**
     * Reads a bot's recent activity, oldest first: the last 20 decisions of its current deployment,
     * each with the lines its call wrote, and its last 20 errors. Older entries are not kept, and
     * each lags the bot by up to about a minute. Follow new entries with the last page's
     * `followToken`. Needs `read-strategies`.
     */
    async listBotLogs(
        input: ListBotLogsInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListStrategyBotLogsResult> {
        const request = parse(ListBotLogsInputSchema, input);
        const res = await this.#client.listBotLogs(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            entries: res.entries.map(formatBotLogEntry),
            nextPageToken: res.nextPageToken,
            followToken: res.followToken,
            deployedAgain: res.deployedAgain,
        };
    }

    /**
     * Publishes a version of one of the caller's strategies as the strategy's community listing,
     * with a title, a description and types, and starts the platform's backtest of it. A strategy
     * has one listing: publishing again shows the new version and makes a `hidden` listing
     * `public` again. The user's own session only: API keys and connected-app sessions are
     * refused (`PermissionError`). An invalid version or failing behaviour examples throw
     * `PreconditionFailedError` (`VERSION_INVALID`, `SCENARIOS_FAILING`), as do a caller without
     * a username (`USERNAME_REQUIRED`), the listing cap (`LISTING_CAP_REACHED`, with
     * `listingCap`) and the daily publish limit (`PUBLISH_LIMIT_REACHED`, with `retryAfter` when
     * the UTC day resets). Reusing `idempotencyKey` for another request throws
     * `AlreadyExistsError` (`IDEMPOTENCY_CONFLICT`).
     */
    async publishVersion(
        input: PublishStrategyVersionInput,
        options?: PolyesterRequestOptions,
    ): Promise<StrategyListing> {
        const request = parse(PublishStrategyVersionInputSchema, input);
        const res = await this.#client.publishStrategyVersion(
            request,
            toConnectCallOptions(options),
        );
        if (!res.listing) throw new Error("PublishStrategyVersion response is missing its listing");
        return formatStrategyListing(res.listing);
    }

    /**
     * Unpublishes one of the caller's community listings: it reads `hidden`, leaves the list and
     * `getCommunity` throws `ResourceNotFoundError` for it; copies already made stay. Unpublishing
     * a `hidden` listing changes nothing. The user's own session only. Another account's listing
     * throws `ResourceNotFoundError` (`LISTING_NOT_FOUND`).
     */
    async unpublish(
        input: StrategyListingInput,
        options?: PolyesterRequestOptions,
    ): Promise<StrategyListing> {
        const request = parse(ListingIdInputSchema, input);
        const res = await this.#client.unpublishStrategy(request, toConnectCallOptions(options));
        if (!res.listing) throw new Error("UnpublishStrategy response is missing its listing");
        return formatStrategyListing(res.listing);
    }

    /**
     * Lists the public community listings, most recently published first, optionally only those
     * of some types or trading some markets, each with its platform backtest's results. Needs no
     * credentials.
     */
    async listCommunity(
        input: ListCommunityStrategiesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListCommunityStrategiesResult> {
        const request = parse(ListCommunityStrategiesInputSchema, input);
        const res = await this.#publicClient.listCommunityStrategies(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            strategies: res.strategies.map(formatCommunityStrategySummary),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Reads one public community listing with its published version's code, manifest, settings
     * form, money rules, flow and platform backtest report. An unknown or unpublished listing
     * throws `ResourceNotFoundError` (`LISTING_NOT_FOUND`), for its author too. Needs no
     * credentials.
     */
    async getCommunity(
        input: StrategyListingInput,
        options?: PolyesterRequestOptions,
    ): Promise<CommunityStrategy> {
        const request = parse(ListingIdInputSchema, input);
        const res = await this.#publicClient.getCommunityStrategy(
            request,
            toConnectCallOptions(options),
        );
        if (!res.strategy) throw new Error("GetCommunityStrategy response is missing its strategy");
        return formatCommunityStrategy(res.strategy);
    }
}
