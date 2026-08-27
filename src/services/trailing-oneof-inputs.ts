import { positiveDecimalInputToScaled, type SdkScales } from "../shared/decimal-surface.js";
import { CatalogConversionError } from "../catalogs/types.js";
import { parseOptionalPositiveIntLike } from "../utils/numbers.js";
import { PROTOBUF_INT32_MAX } from "../shared/wire-bounds.js";

type PositiveIntLikeInput = string | number;

/**
 * Trailing distance and slippage inputs: absolute price distances and
 * slippages are decimal price strings (e.g. "0.50"), converted to wire ticks
 * via the price scale; basis points are integers.
 */
export type TrailingDistanceInput =
    | { kind: "distance"; distance: string }
    | { kind: "bps"; bps: PositiveIntLikeInput }
    | { kind: "none" };

export type SlippageInput =
    | { kind: "slippage"; slippage: string }
    | { kind: "bps"; bps: PositiveIntLikeInput }
    | { kind: "none" };

type UnsetOneof = { case: undefined; value: undefined };

type TrailingDistanceOneof =
    | { case: "trailingDistanceTicks"; value: bigint }
    | { case: "trailingDistanceBps"; value: number }
    | UnsetOneof;

type SlippageOneof<TicksCase extends string, BpsCase extends string> =
    | { case: TicksCase; value: number }
    | { case: BpsCase; value: number }
    | UnsetOneof;

type SlippageOptions<TicksCase extends string, BpsCase extends string> = {
    fieldName: string;
    ticksCase: TicksCase;
    bpsCase: BpsCase;
    maxBps?: number;
};

export function parseTrailingDistanceInput(
    scales: SdkScales,
    distance: TrailingDistanceInput,
    fieldName: string,
): TrailingDistanceOneof {
    if (distance.kind === "none") {
        return { case: undefined, value: undefined };
    }
    if (distance.kind === "distance") {
        return {
            case: "trailingDistanceTicks",
            value: positiveDecimalInputToScaled(
                `${fieldName}.distance`,
                distance.distance,
                scales.price(),
            ),
        };
    }

    const bps = parseOptionalPositiveIntLike(distance.bps);
    if (bps === undefined || bps > Number(PROTOBUF_INT32_MAX)) {
        throw new CatalogConversionError(
            `${fieldName}.bps`,
            `${fieldName}Bps must be a positive integer no greater than ${PROTOBUF_INT32_MAX}`,
        );
    }
    return { case: "trailingDistanceBps", value: bps };
}

export function parseSlippageInput<const TicksCase extends string, const BpsCase extends string>(
    scales: SdkScales,
    slippage: SlippageInput | undefined,
    options: SlippageOptions<TicksCase, BpsCase>,
): SlippageOneof<TicksCase, BpsCase> {
    if (!slippage || slippage.kind === "none") {
        return { case: undefined, value: undefined };
    }
    if (slippage.kind === "slippage") {
        const ticks = positiveDecimalInputToScaled(
            `${options.fieldName}.slippage`,
            slippage.slippage,
            scales.price(),
        );
        if (ticks > PROTOBUF_INT32_MAX) {
            throw new CatalogConversionError(
                `${options.fieldName}.slippage`,
                `${options.fieldName}.slippage exceeds the maximum supported price distance: ${slippage.slippage}`,
            );
        }
        return { case: options.ticksCase, value: Number(ticks) };
    }

    const bps = parseOptionalPositiveIntLike(slippage.bps);
    if (bps === undefined || bps <= 0 || exceedsMax(bps, options.maxBps)) {
        throw new CatalogConversionError(
            `${options.fieldName}.bps`,
            `${options.fieldName}Bps must be ${
                options.maxBps === undefined
                    ? "a positive integer"
                    : `between 1 and ${options.maxBps}`
            }`,
        );
    }
    return { case: options.bpsCase, value: bps };
}

function exceedsMax(value: number, max: number | undefined): boolean {
    return max !== undefined && value > max;
}
