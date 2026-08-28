import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/vip/v1/vip_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthAndPublicApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import {
    VipStatusSchema,
    VipTierCatalogSchema,
    type VipStatus,
    type VipTierCatalog,
} from "./vip.schemas.js";

/**
 * Reads public VIP policy catalogs and authenticated caller-root VIP status.
 */
export class VipService {
    #publicClient: Client<typeof Proto.VIPService>;
    #authClient: Client<typeof Proto.VIPService>;

    constructor(transports: AuthAndPublicApiTransports) {
        this.#publicClient = createClient(Proto.VIPService, transports.publicApi);
        this.#authClient = createClient(Proto.VIPService, transports.authApi);
    }

    /**
     * Returns the complete active VIP0+ tier catalog, including policy version, effective time, retention threshold, and per-tier volume/AOP thresholds and fee rates.
     */
    async listTiers(options?: PolyesterRequestOptions): Promise<VipTierCatalog> {
        const res = await this.#publicClient.listVIPTiers({}, toConnectCallOptions(options));
        return parse(VipTierCatalogSchema, res);
    }

    /**
     * Returns VIP qualification status for the authenticated caller's root account, including effective/volume/AOP tiers, optional rolling metrics, and next-tier thresholds.
     */
    async getStatus(options?: PolyesterRequestOptions): Promise<VipStatus> {
        const res = await this.#authClient.getVIPStatus({}, toConnectCallOptions(options));
        return parse(VipStatusSchema, res);
    }
}
