/**
 * Formats a scaled integer as a decimal string.
 */
export function intToDecimalString(x: bigint | number | string, scale: number): string {
    const s = String(x ?? "0").replace(/[^0-9-]/g, "");
    if (!s) return "0";
    const neg = s.startsWith("-");
    const v = neg ? s.slice(1) : s;
    const d = Math.max(0, Math.trunc(scale));
    const pad = v.padStart(d + 1, "0");
    const head = pad.slice(0, pad.length - d);
    const tail = pad.slice(pad.length - d);
    const raw = head + (d ? "." + tail : "");
    const trimmed = raw.replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/, "");
    return (neg ? "-" : "") + trimmed;
}

/**
 * Formats an 18-decimal scaled integer as a decimal string.
 */
export function int18ToDecimalString(x: bigint | number | string): string {
    return intToDecimalString(x, 18);
}

/**
 * Formats a decimal string to display precision with half-up rounding.
 */
export function formatToDecimals(amount: string, decimals: number, scale: number): string {
    const s = (amount ?? "").trim();
    if (!s) return "0";

    const SCALE = Math.max(0, Math.trunc(scale));
    if (decimals >= SCALE) return trimTrailingZeros(s);

    const parts = s.split(".");
    const intPart = (parts[0] ?? "").replace(/[^0-9]/g, "") || "0";
    let frac = (parts[1] ?? "").replace(/[^0-9]/g, "");
    if (frac.length < SCALE) frac = frac + "0".repeat(SCALE - frac.length);
    else if (frac.length > SCALE) frac = frac.slice(0, SCALE);

    const full = intPart + frac;
    const drop = SCALE - decimals;
    const pow = "1" + "0".repeat(drop);
    const n = BigInt(full);
    const add = drop > 0 ? BigInt("5" + "0".repeat(drop - 1)) : 0n;
    const denom = BigInt(pow);
    const q = (n + add) / denom;

    const qStr = q.toString();
    if (decimals === 0) return qStr;

    const len = qStr.length;
    if (len <= decimals) {
        const frac = qStr.padStart(decimals, "0");
        return trimTrailingZeros("0." + frac);
    }

    const split = len - decimals;
    const head = qStr.slice(0, split);
    const tailRaw = qStr.slice(split).padStart(decimals, "0");
    return trimTrailingZeros(head + "." + tailRaw);
}

function trimTrailingZeros(x: string): string {
    if (!x.includes(".")) return x;
    let y = x.replace(/\.0+$/, "");
    if (y.indexOf(".") >= 0) {
        y = y.replace(/(\.\d*?)0+$/u, "$1");
        if (y.endsWith(".")) y = y.slice(0, -1);
    }
    return y;
}

/**
 * Formats a 6-decimal scaled integer as a decimal string.
 */
export function int6ToDecimalString(x: bigint | number | string): string {
    const s = String(x ?? "0").replace(/[^0-9-]/g, "");
    if (!s) return "0";
    const neg = s.startsWith("-");
    const v = neg ? s.slice(1) : s;
    const d = 6;
    const pad = v.padStart(d + 1, "0");
    const head = pad.slice(0, pad.length - d);
    const tail = pad.slice(pad.length - d);
    const raw = head + (d ? "." + tail : "");
    const trimmed = raw.replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/, "");
    return (neg ? "-" : "") + trimmed;
}
