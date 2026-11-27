import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import { SymbolIdInputSchema } from "../shared.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import { create } from "@bufbuild/protobuf";
import { createClient, type Client } from "@connectrpc/connect";
import {
    deliverBatch,
    publicationHandlerErrorContext,
    type SdkSubscriptionErrorContext,
} from "../../shared/subscription-errors.js";
import { parse } from "../../shared/validation.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { connectReadyGatedProtoChannel } from "../../realtime/ready-gated-subscription.js";
import { snapshotThenStream } from "../../realtime/snapshot-then-stream.js";
import { ServiceUnavailableError } from "../../shared/errors.js";
import {
    readyCallOptions,
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import type { PublicApiTransports } from "../../shared/transports.js";
import * as v from "valibot";
import {
    AssetInfoSchema,
    GetMarketTradesInputSchema,
    GetPriceBandInputSchema,
    formatLivePriceBand,
    type GetPriceBandInput,
    type LivePriceBand,
    ListAssetInfoInputSchema,
    type AssetInfo,
    type ListAssetInfoInput,
    formatMarketTrade,
    type GetMarketTradesInput,
    type SpotConfig,
    SpotConfigSchema,
    type MarketTrade,
    TradeBackfillSchema,
    type TradeBackfill,
} from "./market-data.schemas.js";
import { isDev } from "../../utils/is-dev.js";

interface SubscribeTradesInput extends BaseSubscribeInput<MarketTrade> {
    symbolId: number;
}

interface SubscribePriceBandInput extends BaseSubscribeInput<LivePriceBand> {
    symbolId: number;
}

/** Newer by `epoch`, then `updateId`, then `asOfTsNs`; at an equal one, `unknown` replaces a band. */
function isNewerBand(band: LivePriceBand, than: LivePriceBand): boolean {
    for (const key of ["epoch", "updateId", "asOfTsNs"] as const) {
        const d = BigInt(band[key]) - BigInt(than[key]);
        if (d !== 0n) return d > 0n;
    }
    return band.state === "unknown" && than.state !== "unknown";
}

/** True for `getPriceBand`'s refusal of a band not confirmed in the last 5 seconds. */
function isPriceBandUnknownError(error: unknown): boolean {
    return (
        error instanceof ServiceUnavailableError &&
        /^PRICE_BAND_(STALE|UNKNOWN)$/.test(error.message)
    );
}

/**
 * Exposes public spot trades, spot configuration, and live trade streams.
 */
export class MarketDataService {
    #client: Client<typeof Proto.MarketDataService>;
    #realtime: PolyesterRealtime;
    #scales: SdkScales;

    constructor(transports: PublicApiTransports, realtime: PolyesterRealtime, scales: SdkScales) {
        this.#client = createClient(Proto.MarketDataService, transports.publicApi);
        this.#realtime = realtime;
        this.#scales = scales;
    }

    /**
     * Returns recent public trades for one spot market, ordered newest-first by execution timestamp with match id as a tie-breaker. Supports limit, time bounds, side filtering, and match-id pagination.
     *
     * With `afterTradeId`, it instead walks the symbol's trades by `matchId`, oldest first and
     * gap-free, to backfill trades missed on a live stream, and the result carries `backfill`.
     * Start from `"0"`, then pass `backfill.nextAfterTradeId`; when it equals the `afterTradeId`
     * sent, nothing newer is available yet, so retry later with backoff. `afterTradeId` cannot
     * be combined with `side`, `startTsNs`, `endTsNs` or `pageToken`.
     */
    async listTrades(
        input: GetMarketTradesInput,
        options?: PolyesterRequestOptions,
    ): Promise<{ trades: MarketTrade[]; nextPageToken: string; backfill?: TradeBackfill }> {
        const validatedInput = parse(GetMarketTradesInputSchema, input);
        const callOptions = await readyCallOptions(this.#scales, options);
        const res = await this.#client.getTrades(validatedInput, callOptions);
        const trades = res.trades.map((trade) => formatMarketTrade(this.#scales, trade));
        if (validatedInput.afterTradeId === undefined) {
            return { trades, nextPageToken: res.nextPageToken };
        }
        return {
            trades,
            nextPageToken: res.nextPageToken,
            backfill: parse(TradeBackfillSchema, res),
        };
    }

    /**
     * Returns the cacheable spot reference-data snapshot, including asset metadata, pair trading constraints, display scales, statuses, and market slippage defaults.
     *
     * This is the catalog's own data source, so it must never wait on catalog
     * readiness (that would deadlock the initial catalog refresh) and carries
     * no decimal conversion.
     */
    async getSpotConfig(options?: PolyesterRequestOptions): Promise<SpotConfig> {
        const res = await this.#client.getSpotConfig({}, toConnectCallOptions(options));
        return parse(SpotConfigSchema, res);
    }

    /**
     * Returns team-maintained asset information (description, official links, launch date and
     * price) and market statistics (supplies, market caps and rank) for the requested ledger
     * asset IDs, or for every asset with either, ordered by `assetId`. Assets with neither are
     * omitted. Public and cacheable; no pagination.
     */
    async listAssetInfo(
        input: ListAssetInfoInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<AssetInfo[]> {
        const request = parse(ListAssetInfoInputSchema, input);
        const res = await this.#client.listAssetInfo(request, toConnectCallOptions(options));
        return parse(v.array(AssetInfoSchema), res.assetInfo);
    }

    /**
     * Returns a spot pair's live price band: its reference price and the limit prices the pair
     * admits now. Advisory: the pair checks each order against its own band on arrival. Never
     * cached. A band not confirmed in the last 5 seconds throws `ServiceUnavailableError`
     * (`PRICE_BAND_STALE` or `PRICE_BAND_UNKNOWN`); retry after a second. An unknown `symbolId`
     * throws `ResourceNotFoundError`.
     */
    async getPriceBand(
        input: GetPriceBandInput,
        options?: PolyesterRequestOptions,
    ): Promise<LivePriceBand> {
        const request = parse(GetPriceBandInputSchema, input);
        const res = await this.#client.getPriceBand(request, toConnectCallOptions(options));
        if (!res.band) throw new Error("GetPriceBand response is missing its band");
        return formatLivePriceBand(this.#scales, res.band);
    }

    /**
     * Streams one pair's live price band from public:spot:market:price_band:{symbolId}:proto,
     * emitting the same `LivePriceBand` as `getPriceBand`. Each connection is seeded with
     * `getPriceBand`; the stream sends a changed band at once and re-sends a current one about
     * every 2 seconds.
     *
     * Only a newer band is emitted (greater `epoch`, then `updateId`, then `asOfTsNs`); repeated,
     * late and replayed messages, and a seed the stream already passed, are dropped.
     *
     * Unknown bands arrive as `state: "unknown"` with null prices, never as `onError`: when the
     * seed is refused `PRICE_BAND_STALE` / `PRICE_BAND_UNKNOWN`, when the stream says so, and
     * when `validUntilMs` passes (by the local clock) with no newer message. An emitted band
     * other than `unknown` is current until the next emission, so callers need no
     * `validUntilMs` timer of their own. A seed that fails otherwise (network, unknown
     * `symbolId`) goes to `onError` as `type: "snapshot"`, and the stream still delivers.
     */
    subscribePriceBand(input: SubscribePriceBandInput): () => void {
        const symbolId = parse(SymbolIdInputSchema, input.symbolId);
        const channel = `public:spot:market:price_band:${symbolId}:proto`;
        const scales = this.#scales;
        let current: LivePriceBand | undefined;
        let lapseTimer: ReturnType<typeof setTimeout> | undefined;

        // Shaped like the stream's UNKNOWN: the confirmation it replaces, 0 when none.
        const unknownBand = (from?: LivePriceBand): LivePriceBand => {
            const asOfTsNs = BigInt(from?.asOfTsNs ?? 0);
            return formatLivePriceBand(
                scales,
                create(Proto.LivePriceBandSchema, {
                    symbolId,
                    state: Proto.PriceBandState.UNKNOWN,
                    epoch: BigInt(from?.epoch ?? 0),
                    updateId: BigInt(from?.updateId ?? 0),
                    asOfTsNs,
                    updatedTsNs: asOfTsNs,
                    validUntilTsNs: asOfTsNs,
                }),
            );
        };

        // Emits only the newest of `bands`, and only when it is newer than the current band.
        const apply = (...bands: LivePriceBand[]): void => {
            const band = bands.reduce((a, b) => (isNewerBand(b, a) ? b : a));
            if (current && !isNewerBand(band, current)) return;
            clearTimeout(lapseTimer);
            const lapsed = band.state !== "unknown" && band.validUntilMs <= Date.now();
            current = lapsed ? unknownBand(band) : band;
            if (current.state !== "unknown") {
                const live = current;
                lapseTimer = setTimeout(() => {
                    try {
                        apply(unknownBand(live));
                    } catch (error) {
                        input.onError?.(publicationHandlerErrorContext(channel, error));
                    }
                }, live.validUntilMs - Date.now());
            }
            input.onEvent(current);
        };

        const stream = snapshotThenStream({
            realtime: this.#realtime,
            channel,
            schema: Proto.GetPriceBandResponseSchema,
            snapshotErrorLog: "Failed to fetch price band",
            snapshotFailureMode: "live",
            fetchSnapshot: () =>
                this.getPriceBand({ symbolId }).catch((error: unknown) => {
                    if (isPriceBandUnknownError(error)) return unknownBand();
                    throw error;
                }),
            readPublication: (res) => (res.band ? [res.band] : []),
            applySnapshot: (seed, buffered) =>
                apply(seed, ...buffered.map((band) => formatLivePriceBand(scales, band))),
            applyLivePublications: (bands) =>
                apply(...bands.map((band) => formatLivePriceBand(scales, band))),
            onOpen: input.onOpen,
            onClose: input.onClose,
            onError: input.onError,
        });

        return () => {
            clearTimeout(lapseTimer);
            stream.unsubscribe();
        };
    }

    /**
     * Subscribes to public trade prints on public:spot:market:trades:{symbolId}:proto for the requested symbol and emits parsed market trades.
     * Each publication batches trades, emitted one at a time in execution order; a trade
     * whose `matchId` was already emitted replaces the earlier copy.
     */
    subscribeTrades(input: SubscribeTradesInput): () => void {
        const symbolId = parse(SymbolIdInputSchema, input.symbolId);
        const channel = `public:spot:market:trades:${symbolId}:proto`;
        const notifyError = (error: SdkSubscriptionErrorContext) => {
            if (isDev()) {
                console.error("Market trades subscription error", error);
            }
            input.onError?.(error);
        };
        return connectReadyGatedProtoChannel(this.#realtime, {
            channel,
            schema: Proto.MarketTradeBatchSchema,
            ready: () => this.#scales.ready(),
            onPublication: (batch) =>
                deliverBatch(
                    channel,
                    batch.events,
                    (trade) => input.onEvent(formatMarketTrade(this.#scales, trade)),
                    notifyError,
                ),
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: notifyError,
        });
    }
}
