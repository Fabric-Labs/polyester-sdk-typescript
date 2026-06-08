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
    CandleRowSchema,
    CandleRowIntSchema,
    CandleColumnarSchema,
    CandleColumnarIntSchema,
    CandlePointSchema,
    GetCandlesColumnsInputSchema,
    ListCandlesInputSchema,
    TimeframeSchema,
    type Candle,
    type CandleInt,
    type Timeframe,
    type CandleColumnarInt,
    type GetCandlesInput,
    type GetCandlesColumnsInput,
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

export class CandlesService {
    #client: Client<typeof Proto.MarketDataService>;
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(Proto.MarketDataService, transport);
        this.#realtime = realtime;
    }

    async list(input: GetCandlesInput, options?: PolyesterRequestOptions): Promise<Candle[]> {
        const validatedInput = v.parse(ListCandlesInputSchema, input);
        const res = await this.#client.getCandles(validatedInput, toConnectCallOptions(options));
        const candles = v.parse(v.optional(v.array(CandlePointSchema), []), res.candles);
        return candles.map((c) =>
            v.parse(CandleRowSchema, { ...c, symbolId: res.symbolId, timeframe: res.timeframe }),
        );
    }

    async listColumnar(
        input: GetCandlesColumnsInput,
        options?: PolyesterRequestOptions,
    ): Promise<CandleColumnar> {
        const validatedInput = v.parse(GetCandlesColumnsInputSchema, input);
        const res = await this.#client.getCandlesColumns(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(CandleColumnarSchema, res);
    }

    async listColumnarInts(
        input: GetCandlesColumnsInput,
        options?: PolyesterRequestOptions,
    ): Promise<CandleColumnarInt> {
        const validatedInput = v.parse(GetCandlesColumnsInputSchema, input);
        const res = await this.#client.getCandlesColumns(
            validatedInput,
            toConnectCallOptions(options),
        );
        return v.parse(CandleColumnarIntSchema, res);
    }

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
                const candle = v.parse(CandleRowSchema, {
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
