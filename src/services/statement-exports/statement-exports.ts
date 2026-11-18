import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/ledger/read/v1/statement_export_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import {
    CreateStatementExportInputSchema,
    GetStatementExportInputSchema,
    ListStatementExportsInputSchema,
    ListStatementExportsResultSchema,
    StatementExportDownloadUrlSchema,
    StatementExportSchema,
    type CancelStatementExportInput,
    type CreateStatementExportInput,
    type GetStatementExportDownloadUrlInput,
    type GetStatementExportInput,
    type ListStatementExportsInput,
    type ListStatementExportsResult,
    type StatementExport,
    type StatementExportDownloadUrl,
} from "./statement-exports.schemas.js";

/**
 * Produces whole-period account statements in the background, one RFC 4180 CSV file each: one
 * account, optionally one asset, for a period of at most 366 days. API keys need
 * `read-statements`. A root account has at most 5 exports queued or processing, each account
 * produces one at a time, and a ready file can be downloaded for 7 days.
 *
 * Download a ready file in a browser from `getDownloadUrl`. Servers and CLIs can instead send
 * an authenticated `GET /v1/statements/exports/{exportId}/file`, which returns `text/csv` and
 * supports `Range`; an expired export's file answers 410.
 */
export class StatementExportsService {
    #client: Client<typeof Proto.StatementExportService>;
    #resolver?: SubaccountResolver;

    constructor(transports: AuthApiTransports, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.StatementExportService, transports.authApi);
        this.#resolver = resolver;
    }

    /**
     * Creates an export of the resolved account's statement, or returns the existing one for the
     * same `idempotencyKey`. Throws `PreconditionFailedError` when the key was used with other
     * fields (`IDEMPOTENCY_KEY_REUSED`) or the root account already has 5 exports queued or
     * processing (`STATEMENT_EXPORT_LIMIT_REACHED`). A `ServiceUnavailableError` can be retried
     * with the same request.
     */
    async create(
        input: CreateStatementExportInput,
        options?: PolyesterRequestOptions,
    ): Promise<StatementExport> {
        const request = parse(
            CreateStatementExportInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.createStatementExport(
            request,
            toConnectCallOptions(options),
        );
        return parse(StatementExportSchema, response.export);
    }

    /** Returns one export; poll it until `status` is `ready`, `failed`, `expired` or `canceled`. */
    async get(
        input: GetStatementExportInput,
        options?: PolyesterRequestOptions,
    ): Promise<StatementExport> {
        const request = parse(GetStatementExportInputSchema, input);
        const response = await this.#client.getStatementExport(
            request,
            toConnectCallOptions(options),
        );
        return parse(StatementExportSchema, response.export);
    }

    /**
     * Returns a link valid for 60 seconds that downloads a ready export's file without
     * credentials, for a browser to save; each call returns a new link. Never log `url`. Throws
     * `PreconditionFailedError` before the file is ready (`STATEMENT_EXPORT_NOT_READY`) and for
     * a `failed`, `canceled` or `expired` export, or one with less than 5 seconds left
     * (`STATEMENT_EXPORT_FAILED`, `STATEMENT_EXPORT_CANCELED`, `STATEMENT_EXPORT_EXPIRED`).
     */
    async getDownloadUrl(
        input: GetStatementExportDownloadUrlInput,
        options?: PolyesterRequestOptions,
    ): Promise<StatementExportDownloadUrl> {
        const request = parse(GetStatementExportInputSchema, input);
        const response = await this.#client.getStatementExportDownloadUrl(
            request,
            toConnectCallOptions(options),
        );
        return parse(StatementExportDownloadUrlSchema, response);
    }

    /**
     * Cancels a queued or processing export and returns it `canceled`: it frees its place under
     * the root account's 5, the account's next queued export can start, and any partial file is
     * deleted. Canceling a `canceled` export returns it as it is; a finished one throws
     * `PreconditionFailedError` (`STATEMENT_EXPORT_NOT_CANCELABLE`).
     */
    async cancel(
        input: CancelStatementExportInput,
        options?: PolyesterRequestOptions,
    ): Promise<StatementExport> {
        const request = parse(GetStatementExportInputSchema, input);
        const response = await this.#client.cancelStatementExport(
            request,
            toConnectCallOptions(options),
        );
        return parse(StatementExportSchema, response.export);
    }

    /** Lists the resolved account's exports, newest first, with the root's in-progress count. */
    async list(
        input: ListStatementExportsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListStatementExportsResult> {
        const request = parse(
            ListStatementExportsInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.listStatementExports(
            request,
            toConnectCallOptions(options),
        );
        return parse(ListStatementExportsResultSchema, response);
    }
}
