import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import * as v from "valibot";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import {
    type CandleColumnar,
    CandleRowIntSchema,
    CandleColumnarIntSchema,
    CandlePointSchema,
    TimeframeSchema,
    type Candle,
    type CandleInt,
    type Timeframe,
    type CandleColumnarInt,
    type GetCandlesInput,
    type GetCandlesColumnsInput,
    createCandleColumnarSchema,
    createCandleRowSchema,
    createListCandlesInputSchema,
} from "./candles.schemas.js";
import { TimeframeCodec } from "./candles.codecs.js";
import { staticCatalog, type CatalogReader } from "../../catalogs/index.js";

interface SubscribeCandlesInput extends BaseSubscribeInput<Candle> {
    symbolId: number;
    timeframe: Timeframe;
}

interface SubscribeCandlesIntsInput extends BaseSubscribeInput<CandleInt> {
    symbolId: number;
    timeframe: Timeframe;
}

const SubscribeCandlesParamsSchema = v.object({
    symbolId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
    timeframe: TimeframeSchema,
});

/**
 * Reads and streams public spot OHLCV candle data in row and columnar formats.
 */
export class CandlesService {
    #client: Client<typeof Proto.MarketDataService>;
    #realtime: RealtimeClient;
    #catalog: CatalogReader;

    constructor(
        transport: Transport,
        realtime: RealtimeClient,
        catalog: CatalogReader = staticCatalog,
    ) {
        this.#client = createClient(Proto.MarketDataService, transport);
        this.#realtime = realtime;
        this.#catalog = catalog;
    }

    /**
     * Returns OHLCV candles for a symbol/timeframe request, mapped into row objects with symbol id and timeframe. The proto response is newest-first and may include incomplete/reference data depending on input flags.
     */
    async list(input: GetCandlesInput, options?: PolyesterRequestOptions): Promise<Candle[]> {
        const catalog = this.#catalog.snapshot();
        const validatedInput = v.parse(createListCandlesInputSchema(catalog), input);
        const res = await this.#client.getCandles(validatedInput, toConnectCallOptions(options));
        const candles = v.parse(v.optional(v.array(CandlePointSchema), []), res.candles);
        return candles.map((c) =>
            v.parse(createCandleRowSchema(catalog), {
                ...c,
                symbolId: res.symbolId,
                timeframe: res.timeframe,
            }),
        );
    }

    /**
     * Returns candle data in chart-friendly column arrays ordered oldest-first by bucket start time. This preserves decimal-string SDK formatting from the columnar schema.
     */
    async listColumnar(
        input: GetCandlesColumnsInput,
        options?: PolyesterRequestOptions,
    ): Promise<CandleColumnar> {
        const catalog = this.#catalog.snapshot();
        const validatedInput = v.parse(createListCandlesInputSchema(catalog), input);
        const res = await this.#client.getCandlesColumns(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(createCandleColumnarSchema(catalog), res);
    }

    /**
     * Returns the same columnar candle series using integer tick/scale representations for low-level charting or computation.
     */
    async listColumnarInts(
        input: GetCandlesColumnsInput,
        options?: PolyesterRequestOptions,
    ): Promise<CandleColumnarInt> {
        const validatedInput = v.parse(
            createListCandlesInputSchema(this.#catalog.snapshot()),
            input,
        );
        const res = await this.#client.getCandlesColumns(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(CandleColumnarIntSchema, res);
    }

    /**
     * Subscribes to live candle updates on public:spot:market:candles:{timeframe}:{symbolId}:proto and emits row-form candles.
     */
    subscribe(input: SubscribeCandlesInput): () => void {
        const params = v.parse(SubscribeCandlesParamsSchema, {
            symbolId: input.symbolId,
            timeframe: input.timeframe,
        });
        const protoTimeframe = TimeframeCodec.inputToProto[params.timeframe];
        const channel = `public:spot:market:candles:${params.timeframe}:${params.symbolId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.CandlePointSchema,
            onPublication: (data) => {
                const point = v.parse(CandlePointSchema, data);
                const candle = v.parse(createCandleRowSchema(this.#catalog.snapshot()), {
                    ...point,
                    symbolId: params.symbolId,
                    timeframe: protoTimeframe,
                });
                input.onEvent(candle);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }

    /**
     * Subscribes to the same live candle channel as subscribe, but emits integer row candles instead of formatted decimal rows.
     */
    subscribeInts(input: SubscribeCandlesIntsInput): () => void {
        const params = v.parse(SubscribeCandlesParamsSchema, {
            symbolId: input.symbolId,
            timeframe: input.timeframe,
        });
        const protoTimeframe = TimeframeCodec.inputToProto[params.timeframe];
        const channel = `public:spot:market:candles:${params.timeframe}:${params.symbolId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.CandlePointSchema,
            onPublication: (data) => {
                const point = v.parse(CandlePointSchema, data);
                const candle = v.parse(CandleRowIntSchema, {
                    ...point,
                    symbolId: params.symbolId,
                    timeframe: protoTimeframe,
                });
                input.onEvent(candle);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
