function normalizeUnsignedInteger(value: string): string {
    const normalized = value.replace(/^0+(?=\d)/, "");
    if (!/^\d+$/.test(normalized)) {
        throw new TypeError(
            `Expected an unsigned integer string, received ${JSON.stringify(value)}`,
        );
    }
    return normalized;
}

/** Compare exact unsigned integer strings without narrowing them to a JS number. */
export function compareUnsignedIntegerStrings(left: string, right: string): -1 | 0 | 1 {
    const normalizedLeft = normalizeUnsignedInteger(left);
    const normalizedRight = normalizeUnsignedInteger(right);
    if (normalizedLeft.length !== normalizedRight.length) {
        return normalizedLeft.length < normalizedRight.length ? -1 : 1;
    }
    if (normalizedLeft === normalizedRight) return 0;
    return normalizedLeft < normalizedRight ? -1 : 1;
}

/**
 * Decide whether a realtime/snapshot entity update should replace the current
 * value. Once the current value is versioned, an unversioned update cannot
 * replace it. When both timestamps are known, only a strictly newer update
 * applies; equal values are replays. Two unversioned values preserve legacy
 * last-write behavior.
 */
export function shouldApplyReconciliationUpdate(
    existingTimestampNs: string | undefined,
    incomingTimestampNs: string | undefined,
): boolean {
    if (existingTimestampNs === undefined) return true;
    if (incomingTimestampNs === undefined) return false;
    return compareUnsignedIntegerStrings(incomingTimestampNs, existingTimestampNs) > 0;
}
