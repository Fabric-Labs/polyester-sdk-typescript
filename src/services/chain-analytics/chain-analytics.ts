import * as Proto from "../../gen/chain/analytics/v1/analytics_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import { parse } from "../../shared/validation.js";
import {
    GetUnifiedAssetBalancesInputSchema,
    GetZippedAssetSupplyGroupInputSchema,
    GetZippedAssetSupplyInputSchema,
    createUnifiedAssetBalancesResponseSchema,
    createZippedAssetSupplyGroupResponseSchema,
    createZippedAssetSupplyResponseSchema,
    type GetUnifiedAssetBalancesInput,
    type GetZippedAssetSupplyGroupInput,
    type GetZippedAssetSupplyInput,
    type UnifiedAssetBalancesResponse,
    type ZippedAssetSupplyGroupResponse,
    type ZippedAssetSupplyResponse,
} from "./chain-analytics.schemas.js";

/**
 * Reads public chain analytics chart series.
 */
export class ChainAnalyticsService {
    #client: Client<typeof Proto.ChainAnalyticsService>;
    #scales: SdkScales;

    constructor(transport: Transport, scales: SdkScales) {
        this.#client = createClient(Proto.ChainAnalyticsService, transport);
        this.#scales = scales;
    }

    /**
     * Returns route-scoped zToken supply chart columns for one zipped asset.
     */
    async getZippedAssetSupply(
        input: GetZippedAssetSupplyInput,
        options?: PolyesterRequestOptions,
    ): Promise<ZippedAssetSupplyResponse> {
        const parsedInput = parse(GetZippedAssetSupplyInputSchema, input);
        await this.#scales.ready();
        const response = await this.#client.getZippedAssetSupply(
            parsedInput,
            toConnectCallOptions(options),
        );
        return parse(createZippedAssetSupplyResponseSchema(this.#scales), response);
    }

    /**
     * Returns grouped zToken supply chart columns for all zipped assets in one group.
     */
    async getZippedAssetSupplyGroup(
        input: GetZippedAssetSupplyGroupInput,
        options?: PolyesterRequestOptions,
    ): Promise<ZippedAssetSupplyGroupResponse> {
        const parsedInput = parse(GetZippedAssetSupplyGroupInputSchema, input);
        await this.#scales.ready();
        const response = await this.#client.getZippedAssetSupplyGroup(
            parsedInput,
            toConnectCallOptions(options),
        );
        return parse(createZippedAssetSupplyGroupResponseSchema(this.#scales), response);
    }

    /**
     * Returns total public unified-asset balance chart columns.
     */
    async getUnifiedAssetBalances(
        input: GetUnifiedAssetBalancesInput,
        options?: PolyesterRequestOptions,
    ): Promise<UnifiedAssetBalancesResponse> {
        const parsedInput = parse(GetUnifiedAssetBalancesInputSchema, input);
        await this.#scales.ready();
        const response = await this.#client.getUnifiedAssetBalances(
            parsedInput,
            toConnectCallOptions(options),
        );
        return parse(createUnifiedAssetBalancesResponseSchema(this.#scales), response);
    }
}
