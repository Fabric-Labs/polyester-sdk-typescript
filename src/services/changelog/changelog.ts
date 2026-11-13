import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/changelog/v1/changelog_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { PublicApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import {
    GetChangelogDeploymentGroupInputSchema,
    GetChangelogDeploymentGroupResultSchema,
    GetChangelogPostInputSchema,
    GetChangelogPostResultSchema,
    ListChangelogChangesInputSchema,
    ListChangelogChangesResultSchema,
    ListChangelogDeploymentGroupsInputSchema,
    ListChangelogDeploymentGroupsResultSchema,
    ListChangelogPostsInputSchema,
    ListChangelogPostsResultSchema,
    type ChangelogDeploymentGroup,
    type ChangelogPost,
    type GetChangelogDeploymentGroupInput,
    type GetChangelogPostInput,
    type ListChangelogChangesInput,
    type ListChangelogChangesResult,
    type ListChangelogDeploymentGroupsInput,
    type ListChangelogDeploymentGroupsResult,
    type ListChangelogPostsInput,
    type ListChangelogPostsResult,
} from "./changelog.schemas.js";

/**
 * Reads the product changelog published for the environment the client calls. Public and
 * read-only: no authentication, cacheable GET requests, rate-limited per client address.
 * Enum values the SDK does not know decode as `"unspecified"`.
 */
export class ChangelogService {
    #client: Client<typeof Proto.ChangelogService>;

    constructor(transports: PublicApiTransports) {
        this.#client = createClient(Proto.ChangelogService, transports.publicApi);
    }

    /**
     * Lists post summaries newest first, with change counts by kind. Pass the previous
     * `nextPageToken` as `pageToken` to continue; an empty `nextPageToken` means no more posts.
     * Use `limit: 1` to poll for the latest post. To follow edits to published posts, read a
     * post again when its `revision` differs from the one you hold.
     */
    async listPosts(
        input: ListChangelogPostsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListChangelogPostsResult> {
        const request = parse(ListChangelogPostsInputSchema, input);
        const response = await this.#client.listPosts(request, toConnectCallOptions(options));
        return parse(ListChangelogPostsResultSchema, response);
    }

    /**
     * Returns one post at its current revision, with every section and change. A slug is the post's coverage cutoff date,
     * `YYYY-MM-DD`, with `-2`, `-3` for later posts on the same day. An unknown slug throws a
     * not-found error. Large posts can hold hundreds of changes; page them with `listChanges`
     * and `postSlug` instead.
     */
    async getPost(
        input: GetChangelogPostInput,
        options?: PolyesterRequestOptions,
    ): Promise<ChangelogPost> {
        const request = parse(GetChangelogPostInputSchema, input);
        const response = await this.#client.getPost(request, toConnectCallOptions(options));
        return parse(GetChangelogPostResultSchema, response).post;
    }

    /**
     * Lists individual changes across posts, posts newest first unless `sort` is `"asc"`;
     * changes keep publication order inside each post. Changes addressed to `all_users` match
     * every `audiences` filter. Reuse a `pageToken` only with the same filters, time bounds and
     * sort. When the post a `pageToken` points into was republished since, paging restarts at
     * that post's first change, so changes you already received can appear again: deduplicate
     * by `id`, which stays the same across revisions.
     */
    async listChanges(
        input: ListChangelogChangesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListChangelogChangesResult> {
        const request = parse(ListChangelogChangesInputSchema, input);
        const response = await this.#client.listChanges(request, toConnectCallOptions(options));
        return parse(ListChangelogChangesResultSchema, response);
    }

    /**
     * Lists this environment's deployment groups newest first: each deployment that brought new
     * releases, with the release posts it brought. Pass the previous `nextPageToken` as
     * `pageToken` to continue; an empty `nextPageToken` means no more groups. Empty until the
     * environment publishes release posts.
     */
    async listDeploymentGroups(
        input: ListChangelogDeploymentGroupsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListChangelogDeploymentGroupsResult> {
        const request = parse(ListChangelogDeploymentGroupsInputSchema, input);
        const response = await this.#client.listDeploymentGroups(
            request,
            toConnectCallOptions(options),
        );
        return parse(ListChangelogDeploymentGroupsResultSchema, response);
    }

    /**
     * Returns one deployment group by slug, for example `"testnet-v0.92.9"`, with the changes
     * that need attention and the highlights of its release posts. An unknown slug throws a
     * not-found error.
     */
    async getDeploymentGroup(
        input: GetChangelogDeploymentGroupInput,
        options?: PolyesterRequestOptions,
    ): Promise<ChangelogDeploymentGroup> {
        const request = parse(GetChangelogDeploymentGroupInputSchema, input);
        const response = await this.#client.getDeploymentGroup(
            request,
            toConnectCallOptions(options),
        );
        return parse(GetChangelogDeploymentGroupResultSchema, response).group;
    }
}
