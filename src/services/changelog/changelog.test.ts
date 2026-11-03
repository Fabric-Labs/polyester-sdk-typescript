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
                    coverageCutoff: undefined,
                    changeCount: 1,
                    breakingChangeCount: 0,
                    actionRequiredCount: 0,
                    newFeatureCount: 1,
                    improvementCount: 0,
                    bugFixCount: 0,
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

    it.each([
        ["posts limit above 100", (s: ChangelogService) => s.listPosts({ limit: 101 })],
        ["changes limit above 500", (s: ChangelogService) => s.listChanges({ limit: 501 })],
        ["empty slug", (s: ChangelogService) => s.getPost({ slug: " " })],
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
