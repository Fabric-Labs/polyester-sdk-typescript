import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { publicationHandlerErrorContext } from "../../shared/subscription-errors.js";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import * as v from "../../shared/validation.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { createReadyGate, type SdkScales } from "../../shared/decimal-surface.js";
import {
    type CandleColumnar,
    createCandleRowSchema,
    createCandleRowIntSchema,
    createCandleColumnarSchema,
    createCandleColumnarIntSchema,
    CandlePointSchema,
    TimeframeSchema,
    type Candle,
    type CandleInt,
    type Timeframe,
    type CandleColumnarInt,
    type GetCandlesInput,
    type GetCandlesColumnsInput,
    ListCandlesInputSchema,
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

const SubscribeCandlesParamsSchema = v.object({
    symbolId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
    timeframe: TimeframeSchema,
});

/**
 * Reads and streams public spot OHLCV candle data in row and columnar formats.
 */
export class CandlesService {
    #client: Client<typeof Proto.MarketDataService>;
    #realtime: PolyesterRealtime;
    #scales: SdkScales;
    #rowSchema: ReturnType<typeof createCandleRowSchema>;
    #rowIntSchema: ReturnType<typeof createCandleRowIntSchema>;
    #columnarSchema: ReturnType<typeof createCandleColumnarSchema>;
    #columnarIntSchema: ReturnType<typeof createCandleColumnarIntSchema>;

    constructor(transport: Transport, realtime: PolyesterRealtime, scales: SdkScales) {
        this.#client = createClient(Proto.MarketDataService, transport);
        this.#realtime = realtime;
        this.#scales = scales;
        this.#rowSchema = createCandleRowSchema(scales);
        this.#rowIntSchema = createCandleRowIntSchema(scales);
        this.#columnarSchema = createCandleColumnarSchema(scales);
        this.#columnarIntSchema = createCandleColumnarIntSchema(scales);
    }

    /**
     * Returns OHLCV candles for a symbol/timeframe request, mapped into row objects with symbol id and timeframe. The proto response is newest-first and may include incomplete/reference data depending on input flags.
     */
    async list(input: GetCandlesInput, options?: PolyesterRequestOptions): Promise<Candle[]> {
        const validatedInput = v.parse(ListCandlesInputSchema, input);
        await this.#scales.ready();
        const res = await this.#client.getCandles(validatedInput, toConnectCallOptions(options));
        const candles = v.parse(v.optional(v.array(CandlePointSchema), []), res.candles);
        return candles.map((c) =>
            v.parse(this.#rowSchema, {
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
        const validatedInput = v.parse(ListCandlesInputSchema, input);
        await this.#scales.ready();
        const res = await this.#client.getCandlesColumns(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(this.#columnarSchema, res);
    }

    /**
     * Returns the same columnar candle series keyed by numeric bucket-start seconds (`tsSec`) instead of `time`.
     */
    async listColumnarInts(
        input: GetCandlesColumnsInput,
        options?: PolyesterRequestOptions,
    ): Promise<CandleColumnarInt> {
        const validatedInput = v.parse(ListCandlesInputSchema, input);
        await this.#scales.ready();
        const res = await this.#client.getCandlesColumns(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(this.#columnarIntSchema, res);
    }

    /**
     * Subscribes to live candle updates on public:spot:market:candles:{timeframe}:{symbolId}:proto and emits row-form candles.
     */
    subscribe(input: SubscribeCandlesInput): () => void {
        return this.#subscribeWithSchema(input, this.#rowSchema);
    }

    /**
     * Subscribes to the same live candle channel as subscribe and emits row candles parsed through the row-int schema.
     */
    subscribeInts(input: SubscribeCandlesIntsInput): () => void {
        return this.#subscribeWithSchema(input, this.#rowIntSchema);
    }

    #subscribeWithSchema(
        input: SubscribeCandlesInput | SubscribeCandlesIntsInput,
        schema: ReturnType<typeof createCandleRowSchema>,
    ): () => void {
        const params = v.parse(SubscribeCandlesParamsSchema, {
            symbolId: input.symbolId,
            timeframe: input.timeframe,
        });
        const protoTimeframe = TimeframeCodec.inputToProto[params.timeframe];
        const channel = `public:spot:market:candles:${params.timeframe}:${params.symbolId}:proto`;
        const gate = createReadyGate(
            () => this.#scales.ready(),
            (error) => input.onError?.(publicationHandlerErrorContext(channel, error)),
        );
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.CandlePointSchema,
            onPublication: (data) => {
                gate.run(() => {
                    const point = v.parse(CandlePointSchema, data);
                    const candle = v.parse(schema, {
                        ...point,
                        symbolId: params.symbolId,
                        timeframe: protoTimeframe,
                    });
                    input.onEvent(candle);
                });
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
