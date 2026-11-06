export type ColumnarTimeWindow = {
    startTsSec: number;
    endTsSec: number;
    points: number;
};

function pointCount(points: number): number {
    if (!Number.isFinite(points)) return 0;
    return Math.max(0, Math.trunc(points));
}

export function columnarTimestampSecAt(window: ColumnarTimeWindow, index: number): number | null {
    const points = pointCount(window.points);
    if (points === 0) return null;
    if (!Number.isInteger(index) || index < 0 || index >= points) return null;

    const startTsSec = Number(window.startTsSec);
    const endTsSec = Number(window.endTsSec);
    if (!Number.isFinite(startTsSec) || !Number.isFinite(endTsSec)) return null;
    if (endTsSec < startTsSec) return null;
    if (points === 1) return startTsSec;

    // endTsSec is the last point's own timestamp, so points span points - 1 steps.
    return startTsSec + (index * (endTsSec - startTsSec)) / (points - 1);
}

export function expandColumnarTimestampsSec(
    window: ColumnarTimeWindow,
    count = window.points,
): number[] {
    const points = pointCount(window.points);
    const length = Math.min(points, pointCount(count));
    const timestamps: number[] = [];

    for (let index = 0; index < length; index++) {
        const tsSec = columnarTimestampSecAt(window, index);
        if (tsSec == null) return [];
        timestamps.push(tsSec);
    }

    return timestamps;
}
