import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/system/v1/system_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { PublicApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    ListStatusEventsInputSchema,
    ListStatusEventsResultSchema,
    type ListStatusEventsInput,
    type ListStatusEventsResult,
} from "./system.schemas.js";

/** The build an environment serves. */
export interface SystemVersion {
    /**
     * `MAJOR.MINOR.PATCH` for a release, such as `"0.10.0"`. A build after a release appends the
     * revisions since it and its own short revision, such as `"0.10.0-12-g4e21a2f09670"`.
     */
    version: string;
    /** Full 40-character lowercase source revision. */
    commit: string;
    /** `"devnet"`, `"testnet"`, `"mainnet"`, or `"local"` for a development stack. */
    environment: "devnet" | "testnet" | "mainnet" | "local" | (string & {});
}

/** Facts about the environment itself. Public and read-only: no authentication needed. */
export class SystemService {
    #client: Client<typeof Proto.SystemService>;

    constructor(transports: PublicApiTransports) {
        this.#client = createClient(Proto.SystemService, transports.publicApi);
    }

    /** Returns the version and source revision of the build the environment serves. */
    async getVersion(options?: PolyesterRequestOptions): Promise<SystemVersion> {
        const { version, commit, environment } = await this.#client.getVersion(
            {},
            toConnectCallOptions(options),
        );
        return { version, commit, environment };
    }

    /**
     * Lists scheduled maintenance and incidents, latest start first; with no `states`, current
     * and upcoming events. Answers can be up to 10 seconds old. States follow the clock, so an
     * event can move between pages: match events by `id`.
     */
    async listStatusEvents(
        input: ListStatusEventsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListStatusEventsResult> {
        const request = parse(ListStatusEventsInputSchema, input);
        const response = await this.#client.listStatusEvents(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(ListStatusEventsResultSchema, response);
    }
}
