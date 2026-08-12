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
    type LedgerBalance,
    type LifecycleFlowSummary,
    type MarketOverview,
    type ModifyOrderInput,
    type PolyesterClient,
} from "@polyester/sdk";

declare const client: PolyesterClient;
declare const modifyOrderInput: ModifyOrderInput;

function expectType<T>(_value: T): void {}
type IsAny<T> = 0 extends 1 & T ? true : false;
function expectNotAny<T>(_value: T, _proof: IsAny<T> extends true ? never : true): void {}

async function verifyServiceInference(): Promise<void> {
    const balances = await client.balances.list();
    expectType<LedgerBalance[]>(balances);
    expectNotAny(balances[0], true);

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
