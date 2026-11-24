import { createClient, type Client } from "@connectrpc/connect";
import { SymbolIdInputSchema } from "../shared.js";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import { connectReadyGatedProtoChannel } from "../../realtime/ready-gated-subscription.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import type { PublicApiTransports } from "../../shared/transports.js";
import {
    type CandleColumnar,
    formatCandleRow,
    createCandleColumnarSchema,
    createCandleColumnarIntSchema,
    TimeframeSchema,
    type Candle,
    type CandlePage,
    type CandleInt,
    type Timeframe,
    type CandleColumnarInt,
    type GetCandlesInput,
    type GetCandlesColumnsInput,
    ListCandlesInputSchema,
    ListIndexPriceCandlesInputSchema,
    formatIndexPriceCandles,
    type IndexPriceCandles,
    type ListIndexPriceCandlesInput,
} from "./candles.schemas.js";
import { TimeframeCodec } from "./candles.codecs.js";

interface SubscribeCandlesInput extends BaseSubscribeInput<Candle> {
    symbolId: number;
    timeframe: Timeframe;
}

interface SubscribeCandlesIntsInput extends BaseSubscribeInput<CandleInt> {
    symbolId: number;
    timeframe: Timeframe;
}

const SubscribeCandlesParamsSchema = v.strictObject({
    symbolId: SymbolIdInputSchema,
    timeframe: TimeframeSchema,
});

/**
 * Reads and streams public spot OHLCV candle data in row and columnar formats.
 */
export class CandlesService {
    #client: Client<typeof Proto.MarketDataService>;
    #realtime: PolyesterRealtime;
    #scales: SdkScales;
    #columnarSchema: ReturnType<typeof createCandleColumnarSchema>;
    #columnarIntSchema: ReturnType<typeof createCandleColumnarIntSchema>;

    constructor(transports: PublicApiTransports, realtime: PolyesterRealtime, scales: SdkScales) {
        this.#client = createClient(Proto.MarketDataService, transports.publicApi);
        this.#realtime = realtime;
        this.#scales = scales;
        this.#columnarSchema = createCandleColumnarSchema(scales);
        this.#columnarIntSchema = createCandleColumnarIntSchema(scales);
    }

    /**
     * Returns one page of OHLCV candles for a symbol and timeframe as row objects, newest first:
     * the market's `candles`, its composite `reference` candles when `includeReference` is set,
     * and `nextPageToken` for older candles. A malformed page token, or one from another request,
     * throws `ValidationError` (`PAGE_TOKEN_INVALID`): request the first page again.
     */
    async list(input: GetCandlesInput, options?: PolyesterRequestOptions): Promise<CandlePage> {
        const validatedInput = parse(ListCandlesInputSchema, input);
        await this.#scales.ready();
        const res = await this.#client.getCandles(validatedInput, toConnectCallOptions(options));
        const referencePriceScale = this.#scales.referencePrice(res.symbolId);
        return {
            candles: (res.candles ?? []).map((c) =>
                formatCandleRow(this.#scales, c, res.symbolId, res.timeframe),
            ),
            reference: (res.referenceCandles ?? []).map((c) =>
                formatCandleRow(this.#scales, c, res.symbolId, res.timeframe, referencePriceScale),
            ),
            nextPageToken: res.nextPageToken ?? "",
        };
    }

    /**
     * Returns candle data in chart-friendly column arrays ordered oldest-first by bucket start time. This preserves decimal-string SDK formatting from the columnar schema. A bad page token throws `ValidationError` (`PAGE_TOKEN_INVALID`): request the first page again.
     */
    async listColumnar(
        input: GetCandlesColumnsInput,
        options?: PolyesterRequestOptions,
    ): Promise<CandleColumnar> {
        const validatedInput = parse(ListCandlesInputSchema, input);
        await this.#scales.ready();
        const res = await this.#client.getCandlesColumns(
            validatedInput,
            toConnectCallOptions(options),
        );
        return parse(this.#columnarSchema, res);
    }

    /**
     * Returns the same columnar candle series keyed by numeric bucket-start seconds (`tsSec`) instead of `time`.
     */
    async listColumnarInts(
        input: GetCandlesColumnsInput,
        options?: PolyesterRequestOptions,
    ): Promise<CandleColumnarInt> {
        const validatedInput = parse(ListCandlesInputSchema, input);
        await this.#scales.ready();
        const res = await this.#client.getCandlesColumns(
            validatedInput,
            toConnectCallOptions(options),
        );
        return parse(this.#columnarIntSchema, res);
    }

    /**
     * Returns one page of a market's index price candles, closed only and newest first: its
     * composite reference candles before the bucket containing the pair's listing, its index
     * price candles from that bucket on, each marked with its `source`. There is no volume, and a
     * bucket without an index price is omitted as a gap. Follow `nextPageToken` with the same
     * symbol, timeframe and bounds for older candles. A malformed token, or one from another
     * request, throws `ValidationError` with `detail.code` `PAGE_TOKEN_INVALID`: drop it and
     * request the first page again.
     */
    async listIndexPrice(
        input: ListIndexPriceCandlesInput,
        options?: PolyesterRequestOptions,
    ): Promise<IndexPriceCandles> {
        const request = parse(ListIndexPriceCandlesInputSchema, input);
        await this.#scales.ready();
        const res = await this.#client.getIndexPriceCandles(request, toConnectCallOptions(options));
        return formatIndexPriceCandles(this.#scales, res);
    }

    /**
     * Subscribes to live candle updates on public:spot:market:candles:{timeframe}:{symbolId}:proto and emits row-form candles.
     */
    subscribe(input: SubscribeCandlesInput): () => void {
        return this.#subscribeRows(input);
    }

    /**
     * Subscribes to the same live candle channel as subscribe and emits row candles parsed through the row-int schema.
     */
    subscribeInts(input: SubscribeCandlesIntsInput): () => void {
        return this.#subscribeRows(input);
    }

    #subscribeRows(input: SubscribeCandlesInput | SubscribeCandlesIntsInput): () => void {
        const scales = this.#scales;
        const params = parse(SubscribeCandlesParamsSchema, {
            symbolId: input.symbolId,
            timeframe: input.timeframe,
        });
        const protoTimeframe = TimeframeCodec.inputToProto[params.timeframe];
        const channel = `public:spot:market:candles:${params.timeframe}:${params.symbolId}:proto`;
        return connectReadyGatedProtoChannel(this.#realtime, {
            channel,
            schema: Proto.CandlePointSchema,
            ready: () => this.#scales.ready(),
            onPublication: (data) => {
                input.onEvent(formatCandleRow(scales, data, params.symbolId, protoTimeframe));
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
