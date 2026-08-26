import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    ChangelogConfigError,
    createChangelogFunctions,
    parseChangelogOptions,
    type GitHubInfo,
    type GitHubInfoLookup,
} from "./changelog-github-compact.js";

const REPO = "Fabric-Labs/polyester-sdk-typescript";
const OPTIONS = { repo: REPO };

function links(partial: Partial<GitHubInfo["links"]>): GitHubInfo {
    return {
        links: {
            commit: partial.commit ?? null,
            pull: partial.pull ?? null,
            user: partial.user ?? null,
        },
    };
}

function fakeGitHub(overrides?: Partial<GitHubInfoLookup>): GitHubInfoLookup {
    return {
        async getInfo({ commit }) {
            return links({
                commit: `[\`${commit.slice(0, 7)}\`](https://github.com/${REPO}/commit/${commit})`,
                pull: `[#75](https://github.com/${REPO}/pull/75)`,
            });
        },
        async getInfoFromPullRequest({ pull }) {
            return links({
                pull: `[#${pull}](https://github.com/${REPO}/pull/${pull})`,
                commit: `[\`abc1234\`](https://github.com/${REPO}/commit/abc1234)`,
            });
        },
        ...overrides,
    };
}

describe("parseChangelogOptions", () => {
    it("returns the repo when present", () => {
        expect(parseChangelogOptions(OPTIONS)).toEqual(OPTIONS);
    });

    it("rejects missing or invalid repo values", () => {
        expect(() => parseChangelogOptions(undefined)).toThrow(ChangelogConfigError);
        expect(() => parseChangelogOptions({})).toThrow(ChangelogConfigError);
        expect(() => parseChangelogOptions({ repo: "not-a-repo" })).toThrow(ChangelogConfigError);
        expect(() => parseChangelogOptions({ repo: 1 })).toThrow(ChangelogConfigError);
    });
});

describe("getReleaseLine", () => {
    it("suffixes the summary with a PR link and omits Thanks", async () => {
        const changelog = createChangelogFunctions(fakeGitHub());
        const line = await changelog.getReleaseLine(
            { summary: "feat(orders): require symbol IDs.", commit: "f9590a0fbfab" },
            "minor",
            OPTIONS,
        );

        expect(line).toBe(
            "\n- feat(orders): require symbol IDs. ([#75](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/75))\n",
        );
        expect(line).not.toContain("Thanks");
    });

    it("falls back to the commit link when there is no PR", async () => {
        const changelog = createChangelogFunctions(
            fakeGitHub({
                async getInfo({ commit }) {
                    return links({
                        commit: `[\`${commit.slice(0, 7)}\`](https://github.com/${REPO}/commit/${commit})`,
                    });
                },
            }),
        );
        const line = await changelog.getReleaseLine(
            { summary: "fix(auth): bump timestamps.", commit: "1a5fa52df5ac" },
            "patch",
            OPTIONS,
        );

        expect(line).toBe(
            "\n- fix(auth): bump timestamps. ([`1a5fa52`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/1a5fa52df5ac))\n",
        );
    });

    it("omits a suffix when no commit or PR is available", async () => {
        const changelog = createChangelogFunctions(fakeGitHub());
        const line = await changelog.getReleaseLine(
            { summary: "docs: mention pagination." },
            "patch",
            OPTIONS,
        );
        expect(line).toBe("\n- docs: mention pagination.\n");
    });

    it("uses a PR number declared in the changeset summary", async () => {
        const changelog = createChangelogFunctions(fakeGitHub());
        const line = await changelog.getReleaseLine(
            {
                summary: "pr: #88\ncommit: deadbeefcafebabe\nfeat: expose spot fees.",
                commit: "ignored",
            },
            "minor",
            OPTIONS,
        );

        expect(line).toBe(
            "\n- feat: expose spot fees. ([#88](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/88))\n",
        );
    });

    it("strips author headers and linkifies issue hints", async () => {
        const changelog = createChangelogFunctions(fakeGitHub());
        const line = await changelog.getReleaseLine(
            {
                summary: "author: @huntabyte\nfix the snapshot (fixes #12) and see (see #13).",
                commit: "abc1234",
            },
            "patch",
            OPTIONS,
        );

        expect(line).toBe(
            "\n- fix the snapshot (fixes [#12](https://github.com/Fabric-Labs/polyester-sdk-typescript/issues/12)) and see (see [#13](https://github.com/Fabric-Labs/polyester-sdk-typescript/issues/13)). ([#75](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/75))\n",
        );
    });

    it("indents additional summary lines", async () => {
        const changelog = createChangelogFunctions(
            fakeGitHub({
                async getInfo() {
                    return links({});
                },
            }),
        );
        const line = await changelog.getReleaseLine(
            { summary: "feat: add VIP tiers.\n\nIncludes catalog + status." },
            "minor",
            OPTIONS,
        );

        expect(line).toBe("\n- feat: add VIP tiers.\n  \n  Includes catalog + status.");
    });
});

describe("getDependencyReleaseLine", () => {
    it("returns an empty string when nothing was updated", async () => {
        const changelog = createChangelogFunctions(fakeGitHub());
        await expect(changelog.getDependencyReleaseLine([], [], OPTIONS)).resolves.toBe("");
    });

    it("lists updated dependencies under linked commits", async () => {
        const changelog = createChangelogFunctions(fakeGitHub());
        const line = await changelog.getDependencyReleaseLine(
            [{ summary: "unused", commit: "f9590a0fbfab" }],
            [{ name: "@polyester/sdk", newVersion: "0.9.0" }],
            OPTIONS,
        );

        expect(line).toBe(
            "- Updated dependencies [[`f9590a0`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/f9590a0fbfab)]:\n  - @polyester/sdk@0.9.0",
        );
    });
});

describe("changeset CJS entry", () => {
    it("exports getReleaseLine and getDependencyReleaseLine via require", () => {
        const required = createRequire(import.meta.url)(
            path.resolve(
                path.dirname(fileURLToPath(import.meta.url)),
                "../.changeset/changelog-github-compact.cjs",
            ),
        );
        expect(hasChangelogFunctions(required)).toBe(true);
    });
});

function hasChangelogFunctions(value: unknown): boolean {
    return (
        typeof value === "object" &&
        value !== null &&
        "getReleaseLine" in value &&
        typeof value.getReleaseLine === "function" &&
        "getDependencyReleaseLine" in value &&
        typeof value.getDependencyReleaseLine === "function"
    );
}
