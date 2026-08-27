/**
 * Internal decimal-string math backing catalog conversions.
 *
 * Catalog conversions operate on JSON-safe strings only: human decimal strings
 * on one side and scaled integer strings on the SDK/API side. BigInt is an
 * implementation detail of this module and never crosses the public surface.
 */

/** Raw scaled integer accepted on the SDK side of a conversion. */
export type ScaledIntegerLike = bigint | number | string;

const STRICT_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const INPUT_DECIMAL_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const SCALED_INTEGER_PATTERN = /^-?\d+$/;

export type DecimalToScaledFailure =
    | { reason: "invalid" }
    | { reason: "precision"; maxDecimals: number };

export type DecimalToScaledResult =
    | { ok: true; scaled: bigint }
    | { ok: false; failure: DecimalToScaledFailure };

/**
 * Strictly converts a non-negative decimal string into a scaled bigint.
 * Fails on anything that is not a plain decimal number or whose fractional
 * component still exceeds the scale after trailing zero padding is removed.
 * Zero padding beyond the scale remains exact and is accepted. Never rounds.
 */
export function tryDecimalToScaled(decimal: string, scale: number): DecimalToScaledResult {
    const raw = decimal.trim();
    if (!STRICT_DECIMAL_PATTERN.test(raw)) return { ok: false, failure: { reason: "invalid" } };
    const [intPart = "0", fracPart = ""] = raw.split(".");
    const exactFraction = fracPart.replace(/0+$/, "");
    if (exactFraction.length > scale) {
        return { ok: false, failure: { reason: "precision", maxDecimals: scale } };
    }
    return { ok: true, scaled: BigInt(intPart + exactFraction.padEnd(scale, "0")) };
}

/**
 * Coerces a raw scaled integer (bigint, safe integer number, or base-10
 * integer string) into a bigint. Returns null for anything else — including
 * decimal strings, which indicate the caller is holding an unscaled value.
 */
export function tryToScaledBigInt(value: ScaledIntegerLike): bigint | null {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") {
        return Number.isSafeInteger(value) ? BigInt(value) : null;
    }
    const raw = value.trim();
    return SCALED_INTEGER_PATTERN.test(raw) ? BigInt(raw) : null;
}

/**
 * Renders a scaled bigint as an exact decimal string with trailing zeros
 * trimmed (`1500000n` at scale 6 → `"1.5"`).
 */
export function scaledToDecimal(scaled: bigint, scale: number): string {
    const negative = scaled < 0n;
    const digits = (negative ? -scaled : scaled).toString();
    if (scale <= 0) return negative && digits !== "0" ? `-${digits}` : digits;
    const padded = digits.padStart(scale + 1, "0");
    const intPart = padded.slice(0, -scale);
    const fracPart = padded.slice(-scale).replace(/0+$/, "");
    const body = fracPart ? `${intPart}.${fracPart}` : intPart;
    return negative && body !== "0" ? `-${body}` : body;
}

/**
 * Renders a scaled bigint as a display-normalized decimal string: rounded
 * half-up (away from zero) to `displayDecimals` and trailing zeros trimmed.
 * Not locale-aware — display strings stay plain decimal strings.
 */
export function scaledToDisplay(scaled: bigint, scale: number, displayDecimals: number): string {
    const decimals = Math.max(0, Math.trunc(displayDecimals));
    if (decimals >= scale) return scaledToDecimal(scaled, scale);
    const negative = scaled < 0n;
    const abs = negative ? -scaled : scaled;
    const divisor = 10n ** BigInt(scale - decimals);
    const rounded = (abs + divisor / 2n) / divisor;
    const body = scaledToDecimal(rounded, decimals);
    return negative && body !== "0" ? `-${body}` : body;
}

/**
 * Normalizes raw user input into a canonical decimal string, truncating (not
 * rounding) fractional digits beyond `maxDecimals`. Tolerates partial input
 * forms like `".5"` and `"5."`. Returns null when the input is not a decimal.
 */
export function tryNormalizeDecimalInput(raw: string, maxDecimals: number): string | null {
    const trimmed = raw.trim();
    if (!INPUT_DECIMAL_PATTERN.test(trimmed)) return null;
    const [intRaw = "", fracRaw = ""] = trimmed.split(".");
    const intPart = intRaw.replace(/^0+(?=\d)/, "") || "0";
    const fracPart = fracRaw.slice(0, Math.max(0, maxDecimals)).replace(/0+$/, "");
    return fracPart ? `${intPart}.${fracPart}` : intPart;
}

/**
 * Counts the significant fractional digits of a decimal string
 * (`"0.010"` → 2). Used to derive display precision from tick sizes.
 */
export function significantDecimalPlaces(decimal: string): number {
    const fracPart = decimal.split(".")[1];
    return fracPart ? fracPart.replace(/0+$/, "").length : 0;
}
