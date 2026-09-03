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
    type AddressBookView,
    type ClaimGeneratedUsernameInput,
    type GeneratedUsernameOffer,
    type LedgerBalance,
    type LifecycleFlowSummary,
    type MarketOverview,
    type ModifyOrderInput,
    type ModifyTriggerInput,
    type PauseTriggerInput,
    type PauseTriggerResult,
    type PolyesterClient,
    type PortfolioEquityHistoryResponse,
    type PortfolioEquitySnapshotResponse,
    type ResumeTriggerInput,
    type ResumeTriggerResult,
} from "@polyester/sdk";
import {
    feesPb,
    ledgerReadPb,
    ordersPb,
    resolvePb,
    subaccountsPb,
    tradingRateLimitPb,
    vipPb,
} from "@polyester/sdk/unstable/gen";

declare const client: PolyesterClient;
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

void verifyServiceInference;
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
