import { fc, it } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
    scaledToDecimal,
    scaledToDisplay,
    tryDecimalToScaled,
    tryNormalizeDecimalInput,
} from "./decimal.js";

const DECIMAL_DIGIT = fc.constantFrom(..."0123456789");
const NONZERO_DIGIT = fc.constantFrom(..."123456789");

function digits(minLength: number, maxLength: number) {
    return fc.string({ unit: DECIMAL_DIGIT, minLength, maxLength });
}

const scaleAndMagnitude = fc.tuple(
    fc.integer({ min: 0, max: 18 }),
    fc.bigInt({ min: 0n, max: 10n ** 40n }),
);

const paddedDecimal = fc.integer({ min: 0, max: 18 }).chain((scale) =>
    fc.record({
        scale: fc.constant(scale),
        intDigits: digits(1, 24),
        significantFrac: digits(0, scale),
        paddingZeros: fc.integer({ min: 0, max: 8 }),
    }),
);

const tooPreciseDecimal = fc.integer({ min: 0, max: 18 }).chain((scale) =>
    fc.record({
        scale: fc.constant(scale),
        intDigits: digits(1, 12),
        prefix: digits(scale, scale),
        nonzero: NONZERO_DIGIT,
        tail: digits(0, 4),
    }),
);

const truncatingDecimal = fc.integer({ min: 0, max: 12 }).chain((maxDecimals) =>
    fc.record({
        maxDecimals: fc.constant(maxDecimals),
        intDigits: digits(1, 8),
        kept: digits(maxDecimals, maxDecimals),
        dropped: fc.constantFrom(..."56789"),
        tail: digits(0, 3),
    }),
);

function canonicalInteger(intDigits: string): string {
    return intDigits.replace(/^0+(?=\d)/, "") || "0";
}

// remainder of at least half an ulp rounds away from zero
function halfUpAwayFromZero(scaled: bigint, scale: number, displayDecimals: number): string {
    const decimals = Math.max(0, Math.trunc(displayDecimals));
    if (decimals >= scale) return scaledToDecimal(scaled, scale);
    const negative = scaled < 0n;
    const abs = negative ? -scaled : scaled;
    const divisor = 10n ** BigInt(scale - decimals);
    const quotient = abs / divisor;
    const remainder = abs % divisor;
    const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
    const body = scaledToDecimal(rounded, decimals);
    return negative && body !== "0" ? `-${body}` : body;
}

describe("decimal conversions", () => {
    it.prop([scaleAndMagnitude])(
        "round-trips a non-negative scaled integer through its canonical decimal",
        ([scale, scaled]) => {
            const parsed = tryDecimalToScaled(scaledToDecimal(scaled, scale), scale);
            expect(parsed).toEqual({ ok: true, scaled });
        },
    );

    it.prop([fc.integer({ min: 0, max: 18 }), fc.bigInt({ min: -(10n ** 40n), max: -1n })])(
        "renders a negative scaled integer as the signed absolute decimal",
        (scale, scaled) => {
            const rendered = scaledToDecimal(scaled, scale);
            expect(rendered.startsWith("-")).toBe(true);
            expect(tryDecimalToScaled(rendered.slice(1), scale)).toEqual({
                ok: true,
                scaled: -scaled,
            });
        },
    );

    it.prop([paddedDecimal])(
        "ignores trailing zeros and surrounding whitespace",
        ({ scale, intDigits, significantFrac, paddingZeros }) => {
            const exact =
                significantFrac.length === 0 ? intDigits : `${intDigits}.${significantFrac}`;
            const padded =
                paddingZeros === 0
                    ? exact
                    : `${intDigits}.${significantFrac}${"0".repeat(paddingZeros)}`;
            const parsed = tryDecimalToScaled(padded, scale);
            expect(parsed.ok).toBe(true);
            expect(tryDecimalToScaled(`  ${padded}  `, scale)).toEqual(parsed);
            expect(tryDecimalToScaled(exact, scale)).toEqual(parsed);
            if (!parsed.ok) return;
            expect(tryDecimalToScaled(scaledToDecimal(parsed.scaled, scale), scale)).toEqual(
                parsed,
            );
        },
    );

    it.prop([tooPreciseDecimal])(
        "rejects a non-zero digit past the scale instead of rounding",
        ({ scale, intDigits, prefix, nonzero, tail }) => {
            const parsed = tryDecimalToScaled(`${intDigits}.${prefix}${nonzero}${tail}`, scale);
            expect(parsed).toEqual({
                ok: false,
                failure: { reason: "precision", maxDecimals: scale },
            });
            expect(parsed).not.toEqual(tryDecimalToScaled(`${intDigits}.${prefix}`, scale));
        },
    );

    it.prop([fc.integer({ min: 0, max: 18 }), fc.bigInt({ min: -(10n ** 40n), max: 10n ** 40n })])(
        "emits at most `scale` fractional digits and no trailing zeros",
        (scale, scaled) => {
            const rendered = scaledToDecimal(scaled, scale);
            expect(rendered).toMatch(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
            const fraction = rendered.split(".")[1];
            if (scale <= 0 || fraction === undefined) {
                expect(fraction).toBeUndefined();
                return;
            }
            expect(fraction.length).toBeLessThanOrEqual(scale);
            expect(fraction.endsWith("0")).toBe(false);
        },
    );

    it.prop([
        fc.integer({ min: 0, max: 18 }),
        fc.bigInt({ min: -(10n ** 40n), max: 10n ** 40n }),
        fc.integer({ min: -3, max: 24 }),
    ])("rounds half-up away from zero for display", (scale, scaled, displayDecimals) => {
        expect(scaledToDisplay(scaled, scale, displayDecimals)).toBe(
            halfUpAwayFromZero(scaled, scale, displayDecimals),
        );
    });

    it.prop([fc.string({ maxLength: 40 }), fc.integer({ min: -4, max: 18 })])(
        "normalizes at most once and stays within the decimal budget",
        (raw, maxDecimals) => {
            const once = tryNormalizeDecimalInput(raw, maxDecimals);
            if (once === null) return;
            expect(tryNormalizeDecimalInput(once, maxDecimals)).toBe(once);
            const fraction = once.split(".")[1] ?? "";
            expect(fraction.length).toBeLessThanOrEqual(Math.max(0, maxDecimals));
            expect(once).toMatch(/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/);
        },
    );

    it.prop([truncatingDecimal])(
        "truncates extra fractional digits instead of rounding them",
        ({ maxDecimals, intDigits, kept, dropped, tail }) => {
            const keptSignificant = kept.replace(/0+$/, "");
            const intPart = canonicalInteger(intDigits);
            const expected = keptSignificant ? `${intPart}.${keptSignificant}` : intPart;
            expect(
                tryNormalizeDecimalInput(`${intDigits}.${kept}${dropped}${tail}`, maxDecimals),
            ).toBe(expected);
        },
    );

    it.prop([NONZERO_DIGIT, digits(0, 6), fc.integer({ min: 0, max: 8 })])(
        "treats a leading dot like a leading zero",
        (first, rest, maxDecimals) => {
            const fractional = `.${first}${rest}`;
            expect(tryNormalizeDecimalInput(fractional, maxDecimals)).toBe(
                tryNormalizeDecimalInput(`0${fractional}`, maxDecimals),
            );
        },
    );

    it.prop([digits(1, 8), fc.integer({ min: 0, max: 8 })])(
        "treats a trailing dot as an integer",
        (intDigits, maxDecimals) => {
            expect(tryNormalizeDecimalInput(`${intDigits}.`, maxDecimals)).toBe(
                canonicalInteger(intDigits),
            );
        },
    );

    it.prop([
        fc
            .string({ maxLength: 24 })
            .filter((value) => !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())),
        fc.integer({ min: 0, max: 8 }),
    ])("rejects input that is not a decimal", (raw, maxDecimals) => {
        expect(tryNormalizeDecimalInput(raw, maxDecimals)).toBeNull();
    });
});
