import { create } from "@bufbuild/protobuf";
import * as Proto from "../../gen/chain/zipper/v1/zipper_pb.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import {
    DepositWithdrawConfigSchema,
    createZippedAssetSupplyBatchSchema,
    type DepositWithdrawConfig,
    type ZippedAssetSupplyBatch,
} from "./zipper.schemas.js";
import { parse } from "../../shared/validation.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import { ConfigurationError } from "../../shared/errors.js";
import { snapshotThenStream } from "../../realtime/snapshot-then-stream.js";

export interface SubscribeZippedAssetSupplyInput extends BaseSubscribeInput<ZippedAssetSupplyBatch> {}

/**
 * Reads public Zipper deposit/withdraw chain and asset configuration.
 */
export class ZipperService {
    #client: Client<typeof Proto.ZipperService>;
    #realtime: PolyesterRealtime | undefined;
    #scales: SdkScales | undefined;

    constructor(transport: Transport, realtime?: PolyesterRealtime, scales?: SdkScales) {
        this.#client = createClient(Proto.ZipperService, transport);
        this.#realtime = realtime;
        this.#scales = scales;
    }

    /**
     * Returns supported external chains, unified assets, chain-specific asset variants, network fees, min deposit/withdraw amounts, and contract metadata for Zipper-powered deposit and withdraw flows.
     */
    async getDepositWithdrawConfig(
        options?: PolyesterRequestOptions,
    ): Promise<DepositWithdrawConfig> {
        const res = await this.#client.getDepositWithdrawConfig({}, toConnectCallOptions(options));
        return parse(DepositWithdrawConfigSchema, res);
    }

    /**
     * Attaches to the public supply stream before capturing a route-supply snapshot,
     * then resnapshots whenever the channel establishes a new subscription epoch.
     */
    subscribeZippedAssetSupply(input: SubscribeZippedAssetSupplyInput): () => void {
        const realtime = this.#realtime;
        const scales = this.#scales;
        if (!realtime || !scales) {
            throw new ConfigurationError(
                "Zipper supply subscriptions require a client-owned realtime connection and catalog scales.",
            );
        }

        const channel = "public:chain:zipped-asset:supply:proto";
        const schema = createZippedAssetSupplyBatchSchema(scales);
        let catalogReady = false;
        const parseBatch = (batch: Proto.ZippedAssetSupplyBatch): ZippedAssetSupplyBatch =>
            parse(schema, batch);
        const parseUpdates = (
            updates: readonly Proto.ZippedAssetSupplyUpdate[],
        ): ZippedAssetSupplyBatch["updates"] =>
            parseBatch(create(Proto.ZippedAssetSupplyBatchSchema, { updates: [...updates] }))
                .updates;
        const stream = snapshotThenStream({
            realtime,
            channel,
            schema: Proto.ZippedAssetSupplyBatchSchema,
            snapshotErrorLog: "Failed to fetch zipped asset supply",
            snapshotRetry: { maxAttempts: 3, delayMs: 1_000 },
            snapshotFailureMode: () => (catalogReady ? "live" : "wait"),
            fetchSnapshot: async () => {
                await scales.ready();
                catalogReady = true;
                return this.getDepositWithdrawConfig();
            },
            readPublication: (batch) => batch.updates,
            bufferPublicationKey: (update) => update.zippedAssetId,
            applySnapshot: (snapshot, bufferedUpdates) => {
                const latestByZippedAssetId = new Map<number, string>();
                for (const asset of snapshot.assets) {
                    for (const variant of asset.variants) {
                        latestByZippedAssetId.set(variant.zippedAssetId, variant.supply);
                    }
                }
                for (const update of parseUpdates(bufferedUpdates)) {
                    latestByZippedAssetId.set(update.zippedAssetId, update.supply);
                }
                input.onEvent({
                    updates: Array.from(latestByZippedAssetId, ([zippedAssetId, supply]) => ({
                        zippedAssetId,
                        supply,
                    })),
                });
            },
            applyLivePublications: (updates) => {
                input.onEvent({
                    updates: parseUpdates(updates),
                });
            },
            onOpen: input.onOpen,
            onClose: input.onClose,
            onError: input.onError,
        });

        return () => stream.unsubscribe();
    }
}
