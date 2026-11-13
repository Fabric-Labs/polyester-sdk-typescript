import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/changelog/v1/changelog_pb.js";
import { ValidationError } from "../../shared/errors.js";
import { unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { ChangelogService } from "./changelog.js";

type ChangeInit = Exclude<MessageInitShape<typeof Proto.ChangeSchema>, Proto.Change>;

const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

function change(overrides: ChangeInit = {}) {
    return create(Proto.ChangeSchema, {
        id: 42n,
        title: "Changelog API",
        summary: "Read the changelog.",
        category: Proto.ChangeCategory.NEW_FEATURE,
        audiences: [Proto.Audience.DEVELOPERS],
        surfaces: [Proto.Surface.API],
        ...overrides,
    });
}

const summary = create(Proto.PostSummarySchema, {
    slug: "2026-11-02",
    title: "November 2",
    introduction: "Intro",
    publishedAt: ts(1_700_000_000),
    updatedAt: ts(1_700_086_400),
    revision: 2,
    changeCount: 1,
    newFeatureCount: 1,
});

function serviceReturning(response: Record<string, unknown>) {
    const publicApi = unaryTransport(response);
    return { publicApi, service: new ChangelogService({ publicApi: publicApi.transport }) };
}

describe("ChangelogService", () => {
    it("lists post summaries and forwards paging", async () => {
        const { publicApi, service } = serviceReturning({ posts: [summary], nextPageToken: "n" });
        const signal = new AbortController().signal;

        await expect(
            service.listPosts({ limit: 1, pageToken: " p " }, { signal }),
        ).resolves.toEqual({
            posts: [
                {
                    slug: "2026-11-02",
                    title: "November 2",
                    introduction: "Intro",
                    publishedAt: 1_700_000_000_000,
                    updatedAt: 1_700_086_400_000,
                    revision: 2,
                    coverageCutoff: undefined,
                    changeCount: 1,
                    breakingChangeCount: 0,
                    actionRequiredCount: 0,
                    newFeatureCount: 1,
                    improvementCount: 0,
                    bugFixCount: 0,
                    environments: [],
                },
            ],
            nextPageToken: "n",
        });
        expect(publicApi.lastCall()?.method.localName).toBe("listPosts");
        expect(publicApi.lastCall()?.message).toEqual({ limit: 1, pageToken: "p" });
        expect(publicApi.lastCall()?.signal).toBe(signal);
    });

    it("flattens a post and decodes ids and unknown enums", async () => {
        const { publicApi, service } = serviceReturning({
            post: {
                summary,
                sections: [
                    {
                        heading: "API",
                        surface: Proto.Surface.MARKET_DATA,
                        changes: [
                            change({ surfaces: [99 as Proto.Surface], actionRequired: true }),
                        ],
                    },
                ],
            },
        });

        const post = await service.getPost({ slug: "2026-11-02" });

        expect(post).toMatchObject({
            slug: "2026-11-02",
            publishedAt: 1_700_000_000_000,
            updatedAt: 1_700_086_400_000,
            revision: 2,
            sections: [
                {
                    heading: "API",
                    surface: "market_data",
                    changes: [
                        {
                            id: formatId(42n),
                            category: "new_feature",
                            actionRequired: true,
                            audiences: ["developers"],
                            surfaces: ["unspecified"],
                        },
                    ],
                },
            ],
        });
        expect(publicApi.lastCall()?.message).toEqual({ slug: "2026-11-02" });
    });

    it("maps change filters to the wire and flattens entries", async () => {
        const { publicApi, service } = serviceReturning({
            changes: [
                {
                    change: change({ category: Proto.ChangeCategory.BREAKING_CHANGE }),
                    postSlug: "2026-11-02",
                    publishedAt: ts(1_700_000_000),
                    sectionHeading: "API",
                },
            ],
            nextPageToken: "",
        });

        const result = await service.listChanges({
            categories: ["breaking_change", "bug_fix"],
            actionRequired: false,
            surfaces: ["api"],
            audiences: ["market_makers"],
            startTime: 1_700_000_000_500,
            endTime: 1_700_000_001_000,
            sort: "asc",
            limit: 500,
        });

        expect(result.changes[0]).toMatchObject({
            id: formatId(42n),
            category: "breaking_change",
            postSlug: "2026-11-02",
            publishedAt: 1_700_000_000_000,
            sectionHeading: "API",
        });
        expect(publicApi.lastCall()?.message).toEqual({
            categories: [Proto.ChangeCategory.BREAKING_CHANGE, Proto.ChangeCategory.BUG_FIX],
            actionRequired: false,
            surfaces: [Proto.Surface.API],
            audiences: [Proto.Audience.MARKET_MAKERS],
            startTime: { seconds: 1_700_000_000n, nanos: 500_000_000 },
            endTime: { seconds: 1_700_000_001n, nanos: 0 },
            postSlug: "",
            sort: Proto.SortDirection.SORT_ASC,
            limit: 500,
            pageToken: "",
        });
    });

    it("keeps release presence, environment statuses and change exceptions", async () => {
        const { service } = serviceReturning({
            posts: [
                summary,
                {
                    ...summary,
                    slug: "v0.93.1",
                    releaseVersion: "0.93.1",
                    deploymentGroupSlug: "devnet-v0.93.1",
                    environments: [
                        { environment: Proto.Environment.DEVNET, liveAt: ts(1_700_000_100) },
                        { environment: Proto.Environment.TESTNET },
                    ],
                },
            ],
            nextPageToken: "",
        });

        const { posts } = await service.listPosts();

        expect(posts[0]).toMatchObject({ environments: [] });
        expect(posts[0]?.releaseVersion).toBeUndefined();
        expect(posts[0]?.deploymentGroupSlug).toBeUndefined();
        expect(posts[1]).toMatchObject({
            releaseVersion: "0.93.1",
            deploymentGroupSlug: "devnet-v0.93.1",
            environments: [
                { environment: "devnet", liveAt: 1_700_000_100_000 },
                { environment: "testnet" },
            ],
        });
    });

    it("lists deployment groups and forwards paging", async () => {
        const group = {
            slug: "testnet-v0.92.9",
            environment: Proto.Environment.TESTNET,
            occurredAt: ts(1_700_000_000),
            releaseVersion: "0.92.9",
            versions: ["0.92.8", "0.92.9"],
            posts: [
                {
                    slug: "v0.92.9",
                    releaseVersion: "0.92.9",
                    title: "0.92.9",
                    publishedAt: ts(1_699_000_000),
                    revision: 1,
                },
            ],
        };
        const { publicApi, service } = serviceReturning({ groups: [group], nextPageToken: "n" });

        await expect(service.listDeploymentGroups({ limit: 5, pageToken: " p " })).resolves.toEqual(
            {
                groups: [
                    {
                        slug: "testnet-v0.92.9",
                        environment: "testnet",
                        occurredAt: 1_700_000_000_000,
                        releaseVersion: "0.92.9",
                        releaseTag: undefined,
                        previousReleaseVersion: undefined,
                        versions: ["0.92.8", "0.92.9"],
                        posts: [
                            {
                                slug: "v0.92.9",
                                releaseVersion: "0.92.9",
                                title: "0.92.9",
                                publishedAt: 1_699_000_000_000,
                                revision: 1,
                                updatedAt: undefined,
                            },
                        ],
                    },
                ],
                nextPageToken: "n",
            },
        );
        expect(publicApi.lastCall()?.method.localName).toBe("listDeploymentGroups");
        expect(publicApi.lastCall()?.message).toEqual({ limit: 5, pageToken: "p" });
    });

    it("flattens a deployment group with attention changes and highlights", async () => {
        const { publicApi, service } = serviceReturning({
            group: {
                summary: {
                    slug: "devnet-v0.93.1",
                    environment: Proto.Environment.DEVNET,
                    occurredAt: ts(1_700_000_000),
                    releaseVersion: "0.93.1",
                    releaseTag: "v0.93.1",
                    previousReleaseVersion: "0.93.0",
                    versions: ["0.93.1"],
                },
                attention: [
                    {
                        postSlug: "v0.93.1",
                        releaseVersion: "0.93.1",
                        change: change({
                            category: Proto.ChangeCategory.BREAKING_CHANGE,
                            environmentExceptions: [
                                {
                                    environment: Proto.Environment.TESTNET,
                                    availability: Proto.ChangeAvailability.AHEAD,
                                    liveAt: ts(1_700_000_200),
                                },
                                {
                                    environment: Proto.Environment.MAINNET,
                                    availability: Proto.ChangeAvailability.UNAVAILABLE,
                                },
                            ],
                        }),
                    },
                ],
                highlights: [{ postSlug: "v0.93.1", releaseVersion: "0.93.1", text: "**OCO**" }],
            },
        });

        await expect(
            service.getDeploymentGroup({ slug: " devnet-v0.93.1 " }),
        ).resolves.toMatchObject({
            slug: "devnet-v0.93.1",
            environment: "devnet",
            releaseTag: "v0.93.1",
            previousReleaseVersion: "0.93.0",
            posts: [],
            attention: [
                {
                    id: formatId(42n),
                    category: "breaking_change",
                    postSlug: "v0.93.1",
                    releaseVersion: "0.93.1",
                    environmentExceptions: [
                        {
                            environment: "testnet",
                            availability: "ahead",
                            liveAt: 1_700_000_200_000,
                        },
                        { environment: "mainnet", availability: "unavailable" },
                    ],
                },
            ],
            highlights: [{ postSlug: "v0.93.1", releaseVersion: "0.93.1", text: "**OCO**" }],
        });
        expect(publicApi.lastCall()?.method.localName).toBe("getDeploymentGroup");
        expect(publicApi.lastCall()?.message).toEqual({ slug: "devnet-v0.93.1" });
    });

    it.each([
        ["posts limit above 100", (s: ChangelogService) => s.listPosts({ limit: 101 })],
        ["changes limit above 500", (s: ChangelogService) => s.listChanges({ limit: 501 })],
        ["empty slug", (s: ChangelogService) => s.getPost({ slug: " " })],
        ["empty group slug", (s: ChangelogService) => s.getDeploymentGroup({ slug: " " })],
        [
            "deployment groups limit above 100",
            (s: ChangelogService) => s.listDeploymentGroups({ limit: 101 }),
        ],
        [
            "endTime equal to startTime",
            (s: ChangelogService) => s.listChanges({ startTime: 1_000, endTime: 1_000 }),
        ],
        [
            "unspecified category filter",
            (s: ChangelogService) => s.listChanges({ categories: ["unspecified" as "bug_fix"] }),
        ],
    ])("rejects %s before calling the server", async (_name, call) => {
        const { publicApi, service } = serviceReturning({});

        await expect(call(service)).rejects.toThrow(ValidationError);
        expect(publicApi.calls).toEqual([]);
    });
});
