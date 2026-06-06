// Shared numeric helpers for gRPC/Connect clients.

/**
 * Parse a required uint64 encoded as a base-10 string into bigint.
 * @param raw - The raw string to parse.
 * @param fieldName - The name of the field to parse.
 * @returns The parsed bigint.
 * @throws An error if the field is required and not provided.
 * @throws An error if the field is not a positive integer.
 */
export function parseRequiredUint64Decimal(raw: string, fieldName: string): bigint {
	const s = (raw ?? "").trim();
	if (!s) throw new Error(`${fieldName} is required`);
	if (!/^[0-9]+$/.test(s)) throw new Error(`${fieldName} must be a positive integer`);
	return BigInt(s);
}

/**
 * Parse an optional uint64 encoded as a base-10 string into bigint, or undefined on invalid/empty.
 * @param raw - The raw string to parse.
 * @returns The parsed bigint, or undefined if the field is invalid or empty.
 */
export function parseOptionalUint64Decimal(raw: string | undefined): bigint | undefined {
	const s = (raw ?? "").trim();
	if (!s) return;
	// For optional filters, treat invalid input as "unset" rather than surfacing an error.
	if (!/^[0-9]+$/.test(s)) return;
	return BigInt(s);
}

/**
 * Parse an optional uint64-ish value (string/number/bigint) into bigint, or undefined on invalid/empty.
 * Accepts base-10 strings, numeric inputs (truncated), and bigint inputs.
 */
export function parseOptionalUint64Like(
	value: string | number | bigint | undefined | null
): bigint | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "bigint") return value >= 0n ? value : undefined;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return undefined;
		const n = Math.trunc(value);
		return n >= 0 ? BigInt(n) : undefined;
	}
	return parseOptionalUint64Decimal(value);
}

/**
 * Parse an optional positive integer-ish value (string/number) into a number, or undefined on invalid/empty.
 * Useful for common "limit" fields coming from UI inputs.
 */
export function parseOptionalPositiveIntLike(
	value: string | number | undefined | null
): number | undefined {
	if (value === undefined || value === null) return undefined;
	const n = typeof value === "string" ? Number(value.trim()) : value;
	if (!Number.isFinite(n)) return undefined;
	const int = Math.trunc(n);
	return int > 0 ? int : undefined;
}

/**
 * Convert a decimal string into a scaled bigint (e.g. 18dp quantity, 6dp price).
 * @param raw - The raw string to parse.
 * @param scale - The scale of the number.
 * @param fieldName - The name of the field to parse.
 * @returns The parsed bigint.
 * @throws An error if the field is required and not provided.
 * @throws An error if the field is not a positive number.
 */
export function decimalToScaledInt(raw: string, scale: number, fieldName: string): bigint {
	const s = (raw ?? "").trim();
	if (!s) throw new Error(`${fieldName} is required`);
	if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) throw new Error(`${fieldName} must be a positive number`);
	const [intPartRaw, fracRaw = ""] = s.split(".");
	if (fracRaw.length > scale) {
		throw new Error(`${fieldName} supports at most ${scale} decimal places`);
	}
	const intPart = intPartRaw?.replace(/^0+/, "") ?? "0";
	const fracPart = fracRaw.padEnd(scale, "0");
	const combined = `${intPart}${fracPart}`;
	return BigInt(combined ?? "0");
}

/**
 * Parse a quantity scaled to the given number of decimal places.
 * @param raw - The raw string to parse.
 * @param scale - The number of decimal places to scale to.
 * @param fieldName - The name of the field to parse.
 * @returns The parsed bigint.
 * @throws An error if the field is required and not provided.
 * @throws An error if the field is not a positive number.
 */
export function parseQtyScaled(raw: string, scale: number, fieldName: string): bigint {
	return decimalToScaledInt(raw, scale, fieldName);
}

/**
 * Parse a price scaled to 6 decimal places.
 * @param raw - The raw string to parse.
 * @param fieldName - The name of the field to parse.
 * @returns The parsed bigint.
 * @throws An error if the field is required and not provided.
 * @throws An error if the field is not a positive number.
 */
export function parsePriceTicks(raw: string, fieldName: string): bigint {
	return decimalToScaledInt(raw, 6, fieldName);
}

/**
 * Coerce optional UI number into non-negative bigint (e.g. caps, limits).
 * @param value - The value to coerce.
 * @returns The coerced bigint.
 */
export function toBigIntOrZero(value?: number | null): bigint {
	if (value == null || Number.isNaN(value)) return 0n;
	return BigInt(Math.max(0, Math.trunc(value)));
}

/**
 * Coerce optional UI number into non-negative integer.
 * @param value - The value to coerce.
 * @returns The coerced integer.
 */
export function toIntOrZero(value?: number | null): number {
	if (value == null || Number.isNaN(value)) return 0;
	return Math.max(0, Math.trunc(value));
}

/**
 * Coerce optional UI percentage into non-negative basis points integer.
 * @param value - The value to coerce.
 * @returns The coerced integer.
 */
export function toBpsOrZero(value?: number | null): number {
	if (value == null || Number.isNaN(value)) return 0;
	return Math.max(0, Math.trunc(value * 100));
}

/**
 * Convert basis points to percentage.
 * @param value - The value to convert.
 * @returns The converted percentage.
 */
export function bpsToPct(value?: number | null): number {
	if (value == null || Number.isNaN(value)) return 0;
	return value / 100;
}
