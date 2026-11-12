import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ExportConditions = Record<string, string>;
type PackageManifest = {
    name: string;
    version: string;
    exports: Record<string, ExportConditions>;
};
type PackedFile = { path: string };
type PackResult = {
    filename: string;
    files: PackedFile[];
    name: string;
    version: string;
};

const root = path.resolve(import.meta.dir, "..");
const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
) as PackageManifest;
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "polyester-sdk-package-"));

function run(command: string, args: string[], cwd: string): string {
    const result = Bun.spawnSync([command, ...args], {
        cwd,
        env: {
            ...process.env,
            npm_config_cache: path.join(temporaryDirectory, "npm-cache"),
        },
        stderr: "pipe",
        stdout: "pipe",
    });
    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();
    if (result.exitCode !== 0) {
        throw new Error(
            `${command} ${args.join(" ")} failed with exit code ${result.exitCode}.\n${stdout}${stderr}`,
        );
    }
    return stdout;
}

function wildcardMatches(target: string, packedPath: string): boolean {
    const wildcardIndex = target.indexOf("*");
    const prefix = target.slice(0, wildcardIndex);
    const suffix = target.slice(wildcardIndex + 1);
    return packedPath.startsWith(prefix) && packedPath.endsWith(suffix);
}

try {
    const packOutput = run(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryDirectory],
        root,
    );
    const [packed] = JSON.parse(packOutput) as PackResult[];
    if (!packed) throw new Error("npm pack returned no package metadata.");
    if (packed.name !== manifest.name || packed.version !== manifest.version) {
        throw new Error(
            `Packed ${packed.name}@${packed.version}, expected ${manifest.name}@${manifest.version}.`,
        );
    }

    const packedPaths = new Set(packed.files.map((file) => file.path));
    const missing = new Set<string>();
    for (const [subpath, conditions] of Object.entries(manifest.exports)) {
        for (const [condition, rawTarget] of Object.entries(conditions)) {
            const target = rawTarget.replace(/^\.\//, "");
            const exists = target.includes("*")
                ? [...packedPaths].some((packedPath) => wildcardMatches(target, packedPath))
                : packedPaths.has(target);
            if (!exists) missing.add(`${subpath} ${condition}: ${rawTarget}`);
        }
    }
    if (missing.size > 0) {
        throw new Error(`Missing packed export targets:\n${[...missing].join("\n")}`);
    }

    const consumerDirectory = path.join(temporaryDirectory, "consumer");
    fs.mkdirSync(consumerDirectory);
    fs.writeFileSync(
        path.join(consumerDirectory, "package.json"),
        JSON.stringify({ name: "polyester-sdk-type-consumer", private: true, type: "module" }),
    );
    fs.writeFileSync(
        path.join(consumerDirectory, "tsconfig.json"),
        JSON.stringify({
            compilerOptions: {
                module: "NodeNext",
                moduleResolution: "NodeNext",
                noEmit: true,
                skipLibCheck: false,
                strict: true,
                target: "ES2022",
            },
            include: ["index.ts"],
        }),
    );
    fs.writeFileSync(
        path.join(consumerDirectory, "index.ts"),
        `import {
    ValidationError,
    type CurrencyConversionConfig,
    type CurrencyConversionRates,
    type AddressBookView,
    type ClaimGeneratedUsernameInput,
    type GeneratedUsernameOffer,
    type LadderDetailsOutput,
    type LedgerBalance,
    type LifecycleFlowSummary,
    type MarketOverview,
    type ModifyOrderInput,
    type ModifyTriggerInput,
    type PauseTriggerInput,
    type PauseTriggerResult,
    type PolyesterClient,
    type PolyesterErrorDetail,
    type PortfolioEquityHistoryResponse,
    type PortfolioEquitySnapshotResponse,
    type ResumeTriggerInput,
    type ResumeTriggerResult,
    type SpotPairVolumeSeries,
    type SpotVolumeHistoryResponse,
} from "@polyester/sdk";
import {
    autoWithdrawPb,
    changelogPb,
    checkpointsPb,
    claimsPb,
    feesPb,
    ledgerReadPb,
    ordersPb,
    ordersReadPb,
    quickswapBrokerPb,
    quickswapPb,
    resolvePb,
    rewardsPb,
    subaccountsPb,
    swapPb,
    tradingRateLimitPb,
    vipPb,
} from "@polyester/sdk/unstable/gen";
import type { PolyesterErrorDetail as ErrorsPolyesterErrorDetail } from "@polyester/sdk/errors";
import { assistantService } from "@polyester/sdk/services/assistant";
import { autoWithdrawService } from "@polyester/sdk/services/auto-withdraw";
import { notificationsService } from "@polyester/sdk/services/notifications";
import { ordersService } from "@polyester/sdk/services/orders";
import { priceAlertsService } from "@polyester/sdk/services/price-alerts";
import { tradingRateLimitsService } from "@polyester/sdk/services/rate-limits";

declare const client: PolyesterClient;
declare const ladderDetails: LadderDetailsOutput;
declare const claimGeneratedUsernameInput: ClaimGeneratedUsernameInput;
declare const modifyOrderInput: ModifyOrderInput;
declare const modifyTriggerInput: ModifyTriggerInput;
const clearTriggerInput: ModifyTriggerInput = {
    triggerId: "P",
    symbolId: 1,
    activationPrice: { kind: "none" },
    maxSlippage: { kind: "none" },
};
declare const pauseTriggerInput: PauseTriggerInput;
declare const pauseTriggerResult: PauseTriggerResult;
declare const resumeTriggerInput: ResumeTriggerInput;
declare const resumeTriggerResult: ResumeTriggerResult;

function expectType<T>(_value: T): void {}
type IsAny<T> = 0 extends 1 & T ? true : false;
function expectNotAny<T>(_value: T, _proof: IsAny<T> extends true ? never : true): void {}

async function verifyServiceInference(): Promise<void> {
    const dailyClaim = await client.claims.getDailyClaimStatus();
    expectType<import("@polyester/sdk").DailyClaimStatus>(dailyClaim);
    expectNotAny(dailyClaim, true);
    expectType<import("@polyester/sdk").DailyClaimState>(dailyClaim.state);
    expectType<string | undefined>(dailyClaim.rewards[0]?.amount);
    expectType<number | undefined>(dailyClaim.resetAt);
    expectType<import("@polyester/sdk").ClaimCampaign | undefined>(dailyClaim.campaign);
    expectType<string | undefined>(dailyClaim.subaccountId);
    const claimed = await client.claims.claimDailyReward();
    expectType<import("@polyester/sdk").ClaimDailyRewardResult>(claimed);
    expectNotAny(claimed, true);
    expectType<string | undefined>(claimed.transfers[0]?.transferId);
    const claimedToSubaccount = await client.claims.claimDailyReward(
        { subaccountId: "2" } satisfies import("@polyester/sdk").ClaimDailyRewardInput,
        { signal: new AbortController().signal },
    );
    expectType<string | undefined>(claimedToSubaccount.subaccountId);
    expectNotAny(claimsPb.ClaimsService, true);
    const checkpoints = await client.checkpoints.list(
        { subaccountId: "2" } satisfies import("@polyester/sdk").ListCheckpointsInput,
        { signal: new AbortController().signal },
    );
    expectType<import("@polyester/sdk").Checkpoint[]>(checkpoints);
    expectNotAny(checkpoints, true);
    expectType<number | undefined>(checkpoints[0]?.trades);
    expectType<string | undefined>(checkpoints[0]?.seasonResultUsd);
    expectType<number[][] | undefined>(checkpoints[0]?.tradesByWeekdayHour);
    expectType<import("@polyester/sdk").CheckpointBadge | undefined>(checkpoints[0]?.badges[0]?.badge);
    expectType<import("@polyester/sdk").CheckpointField | undefined>(checkpoints[0]?.incomplete[0]);
    expectNotAny(checkpointsPb.CheckpointService, true);
    const changelogChanges = await client.changelog.listChanges(
        {
            categories: ["breaking_change"],
            startTime: 1_700_000_000_000,
            sort: "asc",
        } satisfies import("@polyester/sdk").ListChangelogChangesInput,
        { signal: new AbortController().signal },
    );
    expectType<import("@polyester/sdk").ListChangelogChangesResult>(changelogChanges);
    expectNotAny(changelogChanges, true);
    expectType<string | undefined>(changelogChanges.changes[0]?.id);
    expectType<number | undefined>(changelogChanges.changes[0]?.publishedAt);
    expectType<import("@polyester/sdk").ChangelogChangeCategory | "unspecified" | undefined>(
        changelogChanges.changes[0]?.category,
    );
    const changelogPost = await client.changelog.getPost({ slug: "2026-11-02" });
    expectType<import("@polyester/sdk").ChangelogPost>(changelogPost);
    expectType<import("@polyester/sdk").ChangelogSection[]>(changelogPost.sections);
    expectType<import("@polyester/sdk").ChangelogSurface | "unspecified" | undefined>(
        changelogPost.sections[0]?.surface,
    );
    expectNotAny(changelogPb.ChangelogService, true);
    const rewardAwards = await client.rewards.listAwards({ limit: 100, pageToken: "next" });
    expectType<import("@polyester/sdk").ListRewardAwardsResult>(rewardAwards);
    expectNotAny(rewardAwards, true);
    expectType<string | undefined>(rewardAwards.awards[0]?.amountBaseUnits);
    expectType<import("@polyester/sdk").RewardFulfillmentState | undefined>(rewardAwards.awards[0]?.fulfillmentState);
    expectType<import("@polyester/sdk").RewardFulfillmentMethod | undefined>(rewardAwards.awards[0]?.fulfillmentMethod);
    expectType<number | undefined>(rewardAwards.awards[0]?.publishedAt);
    expectType<string | undefined>(rewardAwards.awards[0]?.fulfillmentRevision);
    const rewardDestination = await client.rewards.setDestination(
        { awardId: "award-1", destinationAddress: "0xabc", expectedRevision: "1", requestId: "req-1" },
        { stepUpToken: "step-up" },
    );
    expectType<import("@polyester/sdk").SetRewardDestinationResult>(rewardDestination);
    expectNotAny(rewardDestination, true);
    expectType<string>(rewardDestination.award.destinationAddress);
    expectNotAny(rewardsPb.RewardCampaignService, true);
    expectNotAny(quickswapPb.QuickSwapService, true);
    expectNotAny(quickswapBrokerPb.QuickSwapBrokerService, true);
    expectNotAny(swapPb.SwapService, true);
    expectNotAny(autoWithdrawPb.AutoWithdrawService, true);
    const autoWithdrawRule = await client.autoWithdraw.setRule(
        {
            account: "main",
            expectedVersion: 0,
            schedule: { cadence: "weekly", weekday: "friday", minuteOfDay: 540 },
            destinations: [
                {
                    assetId: 1,
                    destinationChainId: 8453,
                    destinationAddress: "0xabc",
                    minAmount: "10",
                    maxAmount: "1000",
                },
            ],
            minUsdValue: null,
        } satisfies import("@polyester/sdk").SetAutoWithdrawRuleInput,
        { stepUpToken: "step-up" },
    );
    expectType<import("@polyester/sdk").AutoWithdrawRule>(autoWithdrawRule);
    expectNotAny(autoWithdrawRule, true);
    expectType<import("@polyester/sdk").AutoWithdrawSchedule>(autoWithdrawRule.schedule);
    expectType<string | null>(autoWithdrawRule.minUsdValue);
    expectType<import("@polyester/sdk").AutoWithdrawRule | null>(await client.autoWithdraw.getRule());
    const autoWithdrawRuns = await client.autoWithdraw.listRuns({ limit: 20, pageToken: "" });
    expectType<import("@polyester/sdk").ListAutoWithdrawRunsResult>(autoWithdrawRuns);
    expectType<import("@polyester/sdk").AutoWithdrawRunState | "unspecified" | undefined>(
        autoWithdrawRuns.runs[0]?.state,
    );
    expectType<string | undefined>(autoWithdrawRuns.runs[0]?.steps[0]?.amount);
    const priceAlert = await client.priceAlerts.create({
        symbolId: 1,
        direction: "above",
        price: "90000",
        channels: ["in_app"],
    } satisfies import("@polyester/sdk").CreatePriceAlertInput);
    expectType<import("@polyester/sdk").PriceAlert>(priceAlert);
    expectNotAny(priceAlert, true);
    expectType<import("@polyester/sdk").PriceAlertStatus | "unspecified">(priceAlert.status);
    expectType<string | null>(priceAlert.triggeredPrice);
    expectType<import("@polyester/sdk").UpdatePriceAlertResult>(
        await client.priceAlerts.update({ alertId: priceAlert.alertId, expectedRevision: "1" }),
    );
    expectType<import("@polyester/sdk").ListPriceAlertsResult>(await client.priceAlerts.list());
    const notificationPage = await client.notifications.list({
        categories: ["alerts"],
        readState: "unread",
        limit: 25,
    } satisfies import("@polyester/sdk").ListNotificationsInput);
    expectType<import("@polyester/sdk").ListNotificationsResult>(notificationPage);
    const notification = notificationPage.notifications[0];
    if (notification) {
        expectType<import("@polyester/sdk").AccountNotification>(notification);
        expectNotAny(notification, true);
        expectType<import("@polyester/sdk").NotificationType | "unspecified">(notification.type);
        if (notification.detail.type === "price_alert") {
            expectType<string>(notification.detail.alertId);
            expectType<string>(notification.detail.triggeredPrice);
        }
        expectType<{ changed: number }>(
            await client.notifications.markRead({ notificationIds: [notification.notificationId] }),
        );
    }
    expectType<import("@polyester/sdk").NotificationCounts>(
        await client.notifications.getCounts(),
    );
    expectType<import("@polyester/sdk").SystemVersion>(await client.system.getVersion());
    const assistantRun = await client.assistant.sendMessage({
        text: "What is my BTC balance?",
        idempotencyKey: "k",
    } satisfies import("@polyester/sdk").SendAssistantMessageInput);
    expectType<string>(assistantRun.runId);
    for await (const event of client.assistant.watchRun({ runId: assistantRun.runId })) {
        expectType<import("@polyester/sdk").AssistantRunEvent>(event);
        expectNotAny(event, true);
    }
    expectType<import("@polyester/sdk").AssistantKey[]>(await client.assistant.listKeys());
    expectType<import("@polyester/sdk").TelegramApprovalLimits>(
        await client.assistant.setTelegramApprovalLimits({
            dailyUsd: "1000",
        } satisfies import("@polyester/sdk").SetTelegramApprovalLimitsInput),
    );
    expectType<import("@polyester/sdk").ApiKey[]>(await client.apiKeys.listAssistantKeys());
    const gtdOrder: import("@polyester/sdk").NewOrderInput = {
        symbolId: 1,
        side: "buy",
        qty: "1",
        execution: { type: "limit_gtd", price: "100", expireAt: Date.now() + 60_000, postOnly: true },
    };
    await client.orders.create(gtdOrder);
    const replacement = await client.orders.batchReplace({ symbolId: 1, items: [{ orderId: "P", newQty: "1" }] });
    expectType<"amended" | "replaced" | "unspecified" | undefined>(replacement.results[0]?.actionTaken);
    expectNotAny(replacement.results[0]?.actionTaken, true);
    const replacementStatus = await client.orders.getBatchReplaceStatus({ batchRequestId: "P" });
    expectType<"amended" | "replaced" | "unspecified" | undefined>(replacementStatus.items[0]?.actionTaken);
    expectNotAny(replacementStatus.items[0]?.actionTaken, true);
    const gtdOrders = await client.orders.listOpen({ symbolId: [1] });
    expectType<number | undefined>(gtdOrders.orders[0]?.expireAt);

    const details = await client.orders.getDetails({ orderId: "P", limit: 100, pageToken: "next" });
    if (details) {
        expectType<string>(details.nextPageToken);
        expectType<import("@polyester/sdk").OrderLineage | undefined>(details.order.lineage);
        expectType<string | undefined>(details.trades[0]?.lineage?.id);
        expectType<number | undefined>(details.transfers[0]?.symbolId);
        expectType<string>(details.order.cumQuote);
        expectType<{ amount: string; isRebate: boolean; qty: string } | undefined>(
            details.order.feeTotal,
        );
    }
    await client.orders.getDetails({ orderId: "P", includeExecutionHistory: false });
    const executions = await client.trades.list({ lineageId: "P", throughGeneration: 2, includeTransfers: true });
    expectType<import("@polyester/sdk").OrderTransfer[]>(executions.transfers);
    expectType<number | undefined>(executions.trades[0]?.lineage?.generation);
    await client.trades.list({ orderId: "P" });
    // @ts-expect-error Execution scopes are mutually exclusive.
    client.trades.list({ orderId: "P", lineageId: "Q" });
    // @ts-expect-error Replay requires a symbol.
    client.trades.list({ afterMatchId: "1" });
    expectNotAny(ordersReadPb.OrderLineageSchema, true);

    const challengeInput: import("@polyester/sdk").CreateWalletChallengeInput = {
        smartAccountAddress: "0x1111111111111111111111111111111111111111",
        signerAddress: "0x1111111111111111111111111111111111111111",
        uri: "https://app.example",
    };
    const challenge = await client.auth.createWalletChallenge(challengeInput);
    expectType<import("@polyester/sdk").WalletChallenge>(challenge);
    expectType<string>(challenge.message);
    expectType<number | undefined>(challenge.expiresAt);
    const subaccountChallenge = await client.subaccounts.createChallenge({
        ownerAddress: challengeInput.signerAddress,
        uri: challengeInput.uri,
    });
    expectType<import("@polyester/sdk").SubaccountChallenge>(subaccountChallenge);
    expectType<number>(subaccountChallenge.smartAccountSaltNonce);
    // @ts-expect-error Wallet challenges are login-only; the purpose field was removed.
    client.auth.createWalletChallenge({ ...challengeInput, purpose: "login" });
    // @ts-expect-error Nonce authentication was removed from the protocol.
    client.auth.requestLoginNonce(challengeInput.smartAccountAddress);

    expectType<CurrencyConversionConfig>(await client.marketOverview.getCurrencyConversionConfig());
    const conversion = await client.marketOverview.getCurrencyConversionRates();
    expectType<CurrencyConversionRates>(conversion);
    expectType<string | undefined>(conversion.fiat?.rates[0]?.unitsPerUsd);
    expectType<string | undefined>(conversion.stablecoins[0]?.usdPerUnit);
    expectType<void>(await client.auth.acceptTerms());
    expectType<boolean>((await client.auth.profile.get()).currentTermsAccepted);
    const termsDetail: Extract<PolyesterErrorDetail, { service: "auth" }> = {
        service: "auth", code: "AUTH_TERMS_NOT_ACCEPTED", message: "Accept terms",
    };
    expectType<ErrorsPolyesterErrorDetail>(termsDetail);
    const withdrawDetail: Extract<PolyesterErrorDetail, { service: "withdraw" }> = {
        service: "withdraw",
        code: "AMOUNT_BELOW_MINIMUM",
    };
    expectType<PolyesterErrorDetail>(withdrawDetail);
    expectType<ErrorsPolyesterErrorDetail>(withdrawDetail);
    const withdrawalError = new ValidationError("withdrawal rejected", { detail: withdrawDetail });
    if (withdrawalError.detail?.service === "withdraw") {
        expectType<Extract<PolyesterErrorDetail, { service: "withdraw" }>>(withdrawalError.detail);
    }
    // @ts-expect-error Each detail code belongs to its service.
    const invalidWithdrawDetail: PolyesterErrorDetail = { service: "withdraw", code: "STALE_QUOTE" };
    void invalidWithdrawDetail;
    expectNotAny(feesPb, true);
    expectType<resolvePb.ResolvedAccount_Kind>(resolvePb.ResolvedAccount_Kind.SUB);
    expectType<subaccountsPb.SubaccountInviteDirection>(
        subaccountsPb.SubaccountInviteDirection.OUTGOING,
    );
    expectType<ordersPb.CancelOrderResponse_Status>(ordersPb.CancelOrderResponse_Status.ACCEPTED);
    expectType<ordersPb.CancelAllOrdersResponse_Status>(
        ordersPb.CancelAllOrdersResponse_Status.SUBMITTED,
    );
    expectType<ordersPb.CancelAllAfterResponse_Status>(
        ordersPb.CancelAllAfterResponse_Status.ARMED,
    );
    expectType<ordersPb.BatchCancelResultItem_Status>(
        ordersPb.BatchCancelResultItem_Status.ACCEPTED,
    );
    expectType<subaccountsPb.SubaccountStatus>(subaccountsPb.SubaccountStatus.ACTIVE);
    expectNotAny(tradingRateLimitPb, true);
    expectNotAny(vipPb, true);
    expectNotAny(ledgerReadPb.GetPortfolioEquitySnapshotResponseSchema, true);

    const usernameOffer = await client.auth.profile.generateUsernameOptions();
    expectType<GeneratedUsernameOffer>(usernameOffer);
    expectNotAny(usernameOffer, true);
    await client.auth.profile.claimGeneratedUsername(claimGeneratedUsernameInput);

    const balances = await client.balances.list();
    expectType<LedgerBalance[]>(balances);
    expectNotAny(balances[0], true);

    const portfolioHistory = await client.balances.getPortfolioEquityHistory({ range: "1d" });
    expectType<PortfolioEquityHistoryResponse>(portfolioHistory);
    expectNotAny(portfolioHistory.series[0], true);

    const portfolioSnapshot = await client.balances.getPortfolioEquitySnapshot();
    expectType<PortfolioEquitySnapshotResponse>(portfolioSnapshot);
    expectNotAny(portfolioSnapshot.accounts[0], true);

    const flows = (await client.lifecycle.listFlows({})).flows;
    expectType<LifecycleFlowSummary[]>(flows);
    expectNotAny(flows[0], true);

    const addressBook = await client.addressBook.getView();
    expectType<AddressBookView>(addressBook);
    expectNotAny(addressBook, true);

    const markets = (await client.marketOverview.list()).markets;
    expectType<MarketOverview[]>(markets);
    expectNotAny(markets[0], true);
    expectType<string | undefined>(markets[0]!.volume24hBase);
    expectType<string | undefined>(markets[0]!.volume24hQuote);
    expectType<string | undefined>(markets[0]!.volume24hUsd);
    await client.marketOverview.list({ orderBy: "volume_24h_usd" });
    // @ts-expect-error Quote-volume sorting was replaced by canonical USD volume.
    await client.marketOverview.list({ orderBy: "volume_24h_quote" });
    const volumeHistory = await client.marketOverview.getSpotVolumeHistory({ symbolIds: [1] });
    expectType<SpotVolumeHistoryResponse>(volumeHistory);
    expectType<SpotPairVolumeSeries[]>(volumeHistory.pairs);
    expectType<string[]>(volumeHistory.totalVolumeUsd);
    expectNotAny(volumeHistory, true);
    await client.socialVerification.start({ provider: "discord" });

    expectType<string>(ladderDetails.executedQty);
    expectType<number>(ladderDetails.executedLevels);
    const triggerEvents = await client.triggers.listEvents({ triggerId: "T", eventType: "activated" });
    expectType<"fired" | "canceled" | "updated" | "failed" | "activated" | "armed" | "fire_refused" | "unspecified" | undefined>(
        triggerEvents.events[0]?.eventType,
    );
    expectType<import("@polyester/sdk").TriggerEvent["failureReason"]>(
        triggerEvents.events[0]?.fireRefusalReason,
    );
    const trailingTrigger = await client.triggers.get({ triggerId: "T" });
    if (trailingTrigger?.runtimeDetails.case === "trailing") {
        expectType<string | undefined>(trailingTrigger.runtimeDetails.triggerPrice);
    }
    await client.triggers.create({
        triggerType: "twap",
        symbolId: 1,
        side: "buy",
        qty: "1",
        durationMs: "60000",
        sliceIntervalMs: 5000,
        execution: { type: "market_ioc", maxSlippage: { kind: "bps", bps: 50 } },
    });
    const oco: import("@polyester/sdk").CreateOcoResult = await client.triggers.createOco({
        symbolId: 1,
        side: "sell",
        qty: "1",
        takeProfit: { triggerPrice: "110", execution: { type: "limit_gtc", price: "109" } },
        stopLoss: { triggerPrice: "90", execution: { type: "market_ioc" } },
    });
    expectType<string>(oco.stopLossTriggerId);
    const canceledTriggers: import("@polyester/sdk").BatchCancelTriggersResult =
        await client.triggers.batchCancel({ triggerIds: [oco.takeProfitTriggerId] });
    expectNotAny(canceledTriggers.results[0], true);
    await client.orders.cancelAll({ symbolIds: [1, 2] });
    // @ts-expect-error Cancel-all uses the repeated symbolIds contract.
    await client.orders.cancelAll({ symbolId: 1 });

    expectNotAny(modifyOrderInput, true);
    await client.orders.modify(modifyOrderInput);

    expectNotAny(modifyTriggerInput, true);
    await client.triggers.modify(modifyTriggerInput);
    await client.triggers.modify(clearTriggerInput);

    expectNotAny(pauseTriggerInput, true);
    expectNotAny(pauseTriggerResult, true);
    await client.triggers.pause(pauseTriggerInput);

    expectNotAny(resumeTriggerInput, true);
    expectNotAny(resumeTriggerResult, true);
    await client.triggers.resume(resumeTriggerInput);

    client.balances.subscribe({
        accountId: "account-id",
        onEvent: (balance) => {
            expectType<LedgerBalance>(balance);
            expectNotAny(balance, true);
        },
    });
    client.lifecycle.subscribeOpenFlows({
        onEvent: (flow) => {
            expectType<LifecycleFlowSummary>(flow);
            expectNotAny(flow, true);
        },
    });
    client.marketOverview.subscribe({
        onEvent: (markets) => {
            expectType<MarketOverview[]>(markets);
            expectNotAny(markets[0], true);
        },
    });
}

declare const browserCore: import("@polyester/sdk").PolyesterBrowserCore;
declare const serverCore: import("@polyester/sdk").PolyesterServerCore;

async function verifyCoreServiceAccessors(): Promise<void> {
    expectType<typeof client.orders>(ordersService(browserCore));
    expectNotAny(ordersService(browserCore), true);
    await ordersService(serverCore).cancelAll({ symbolIds: [1] });
    expectType<typeof client.tradingRateLimits>(tradingRateLimitsService(client));
    expectType<typeof client.autoWithdraw>(autoWithdrawService(browserCore));
    expectType<typeof client.priceAlerts>(priceAlertsService(browserCore));
    expectType<typeof client.notifications>(notificationsService(browserCore));
    expectType<typeof client.assistant>(assistantService(browserCore));
    expectType<import("@polyester/sdk").AuthState>(browserCore.auth.getState());
    expectType<boolean>(serverCore.hasDisplaySession);
    // @ts-expect-error Cores only expose services through their accessors.
    void browserCore.orders;
}

void verifyServiceInference;
void verifyCoreServiceAccessors;
`,
    );

    const tarball = path.join(temporaryDirectory, packed.filename);
    run(
        "npm",
        [
            "install",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--no-package-lock",
            tarball,
            "typescript@6.0.3",
        ],
        consumerDirectory,
    );
    run(
        path.join(consumerDirectory, "node_modules", ".bin", "tsc"),
        ["--noEmit"],
        consumerDirectory,
    );

    console.log(
        `Verified ${packed.files.length} packed files, ${Object.keys(manifest.exports).length} exports, and strict external TypeScript inference.`,
    );
} finally {
    fs.rmSync(temporaryDirectory, { force: true, recursive: true });
}
