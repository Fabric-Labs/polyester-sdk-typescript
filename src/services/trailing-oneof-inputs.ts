import { parseOptionalPositiveIntLike, parsePriceTicks } from "../utils/numbers.js";

type PositiveIntLikeInput = string | number;

export type TrailingDistanceInput =
    | { kind: "ticks"; ticks: PositiveIntLikeInput }
    | { kind: "quote"; quote: string }
    | { kind: "percent"; percent: PositiveIntLikeInput }
    | { kind: "bps"; bps: PositiveIntLikeInput }
    | { kind: "none" };

export type SlippageInput =
    | { kind: "ticks"; ticks: PositiveIntLikeInput }
    | { kind: "quote"; quote: string }
    | { kind: "percent"; percent: PositiveIntLikeInput }
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
    maxTicks?: number;
    maxBps?: number;
    maxPercent?: number;
};

export function parseTrailingDistanceInput(
    distance: TrailingDistanceInput,
    fieldName: string,
): TrailingDistanceOneof {
    if (distance.kind === "none") {
        return { case: undefined, value: undefined };
    }
    if (distance.kind === "ticks") {
        const ticks = parseOptionalPositiveIntLike(distance.ticks);
        if (ticks === undefined || ticks <= 0) {
            throw new Error(`${fieldName}Ticks must be a positive integer`);
        }
        return { case: "trailingDistanceTicks", value: BigInt(ticks) };
    }
    if (distance.kind === "quote") {
        const ticks = parsePriceTicks(distance.quote, fieldName);
        return { case: "trailingDistanceTicks", value: ticks };
    }
    if (distance.kind === "percent") {
        const percent =
            typeof distance.percent === "string"
                ? Number.parseFloat(distance.percent)
                : distance.percent;
        if (!Number.isFinite(percent) || percent <= 0) {
            throw new Error(`${fieldName}Percent must be a positive number`);
        }
        return { case: "trailingDistanceBps", value: Math.round(percent * 100) };
    }

    const bps = parseOptionalPositiveIntLike(distance.bps);
    if (bps === undefined || bps <= 0) {
        throw new Error(`${fieldName}Bps must be a positive integer`);
    }
    return { case: "trailingDistanceBps", value: bps };
}

export function parseSlippageInput<const TicksCase extends string, const BpsCase extends string>(
    slippage: SlippageInput | undefined,
    options: SlippageOptions<TicksCase, BpsCase>,
): SlippageOneof<TicksCase, BpsCase> {
    if (!slippage || slippage.kind === "none") {
        return { case: undefined, value: undefined };
    }
    if (slippage.kind === "ticks") {
        const ticks = parseOptionalPositiveIntLike(slippage.ticks);
        if (ticks === undefined || ticks <= 0 || exceedsMax(ticks, options.maxTicks)) {
            throw new Error(
                `${options.fieldName}Ticks must be ${
                    options.maxTicks === undefined ? "a positive integer" : "a positive int32"
                }`,
            );
        }
        return { case: options.ticksCase, value: ticks };
    }
    if (slippage.kind === "quote") {
        const ticks = parsePriceTicks(slippage.quote, options.fieldName);
        if (options.maxTicks !== undefined && (ticks <= 0n || ticks > BigInt(options.maxTicks))) {
            throw new Error(`${options.fieldName}Ticks must be a positive int32`);
        }
        return { case: options.ticksCase, value: Number(ticks) };
    }
    if (slippage.kind === "percent") {
        const percent =
            typeof slippage.percent === "string"
                ? Number.parseFloat(slippage.percent)
                : slippage.percent;
        if (
            !Number.isFinite(percent) ||
            percent <= 0 ||
            (options.maxPercent !== undefined && percent > options.maxPercent)
        ) {
            throw new Error(
                `${options.fieldName}Percent must be ${
                    options.maxPercent === undefined
                        ? "a positive number"
                        : `between 0 and ${options.maxPercent}`
                }`,
            );
        }
        return { case: options.bpsCase, value: Math.round(percent * 100) };
    }

    const bps = parseOptionalPositiveIntLike(slippage.bps);
    if (bps === undefined || bps <= 0 || exceedsMax(bps, options.maxBps)) {
        throw new Error(
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
