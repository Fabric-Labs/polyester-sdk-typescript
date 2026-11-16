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
    StatementExportSchema,
    type CreateStatementExportInput,
    type GetStatementExportInput,
    type ListStatementExportsInput,
    type ListStatementExportsResult,
    type StatementExport,
} from "./statement-exports.schemas.js";

/**
 * Produces whole-period account statements in the background, one CSV file each: the same
 * rows, account, asset and period choices as `balances.exportStatement`, concatenated. API keys
 * need `read-statements`. A root account has at most 5 exports queued or processing, each
 * account produces one at a time, and a ready file can be downloaded for 7 days.
 *
 * The file itself is REST only: an authenticated `GET /v1/statements/exports/{exportId}/file`
 * returns `text/csv` and supports `Range`; `?redirect=true` answers a 307 to a URL valid for 60
 * seconds. An expired export's file answers 410.
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

    /** Returns one export; poll it until `status` is `ready`, `failed` or `expired`. */
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

    /** Lists the resolved account's exports, newest first. */
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
