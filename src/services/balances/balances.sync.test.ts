import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableError, ValidationError } from "../../shared/errors.js";
import type { LedgerBalanceSnapshot, LedgerBalanceUpdate } from "./balances.schemas.js";
import {
    INCOMPLETE_STEP_TIMEOUT_MS,
    createBalanceSync,
    type LedgerBalancesEvent,
} from "./balances.sync.js";

function snapshot(epoch: string, sequence: string, trading = "1"): LedgerBalanceSnapshot {
    return {
        balances: [
            {
                assetId: 1,
                trading,
                reserved: "0",
                available: trading,
                funding: "5",
                fundingRevision: "10",
            },
        ],
        tradingEpoch: epoch,
        tradingSequence: sequence,
        tradingAppliedThroughTsNs: "0",
    };
}

function trading(
    epoch: string,
    sequence: number,
    value: string,
    complete = true,
): LedgerBalanceUpdate {
    return {
        account: "trading",
        tradingEpoch: epoch,
        tradingSequence: String(sequence),
        complete,
        tradingAppliedThroughTsNs: String(sequence),
        balances: [{ assetId: 1, trading: value, reserved: "0", available: value }],
        transfers: [],
    };
}

function funding(revision: string, value: string): LedgerBalanceUpdate {
    return {
        account: "funding",
        balances: [{ assetId: 1, funding: value, fundingRevision: revision }],
    };
}

function setup(...answers: Array<LedgerBalanceSnapshot | Error>) {
    const events: LedgerBalancesEvent[] = [];
    const errors: unknown[] = [];
    const fetchSnapshot = vi.fn(async () => {
        const next = answers.length > 1 ? answers.shift() : answers[0];
        if (next instanceof Error) throw next;
        return next!;
    });
    const sync = createBalanceSync({
        fetchSnapshot,
        emit: (event) => events.push(event),
        onSnapshotError: (error) => errors.push(error),
        isConnected: () => true,
    });
    const trading1 = () => events.map((e) => [e.kind, e.balances[0]?.trading, e.tradingSequence]);
    return { sync, events, errors, fetchSnapshot, trading1 };
}

describe("createBalanceSync", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("buffers until the snapshot answers, then applies only the steps after its position", async () => {
        const { sync, trading1 } = setup(snapshot("E", "2"));
        sync.connected();
        sync.update(trading("E", 2, "stale"));
        sync.update(trading("E", 3, "3"));
        await vi.advanceTimersByTimeAsync(0);
        sync.update(trading("E", 3, "repeat"));
        sync.update(trading("E", 4, "4"));

        expect(trading1()).toEqual([
            ["snapshot", "1", "2"],
            ["trading", "3", "3"],
            ["trading", "4", "4"],
        ]);
    });

    it("emits a step only once it is complete and keeps funding from the newest revision", async () => {
        const { sync, events, trading1 } = setup(snapshot("E", "0"));
        sync.connected();
        await vi.advanceTimersByTimeAsync(0);
        sync.update(trading("E", 1, "half", false));
        sync.update(funding("9", "old"));
        sync.update(funding("11", "6"));
        sync.update(trading("E", 2, "2"));

        expect(trading1()).toEqual([
            ["snapshot", "1", "0"],
            ["funding", "1", "0"],
            ["trading", "2", "2"],
        ]);
        expect(events.at(-1)?.balances[0]).toMatchObject({ funding: "6", fundingRevision: "11" });
    });

    it("reloads on a sequence gap, a new epoch, or a stalled incomplete step", async () => {
        const { sync, fetchSnapshot } = setup(
            snapshot("E", "0"),
            snapshot("E", "5"),
            snapshot("F", "1"),
            snapshot("F", "1"),
        );
        sync.connected();
        await vi.advanceTimersByTimeAsync(0);

        sync.update(trading("E", 3, "gap"));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchSnapshot).toHaveBeenCalledTimes(2);

        sync.update(trading("F", 1, "new epoch"));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchSnapshot).toHaveBeenCalledTimes(3);

        // E was held before F, so its late updates are dropped without reloading.
        sync.update(trading("E", 6, "late"));
        sync.update(trading("F", 2, "half", false));
        sync.update(funding("99", "x"));
        await vi.advanceTimersByTimeAsync(INCOMPLETE_STEP_TIMEOUT_MS - 1);
        expect(fetchSnapshot).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetchSnapshot).toHaveBeenCalledTimes(4);
    });

    it("drops an epoch received before the load that answered another one", async () => {
        const { sync, fetchSnapshot } = setup(snapshot("F", "0"));
        sync.update(trading("E", 9, "before load"));
        sync.connected();
        await vi.advanceTimersByTimeAsync(0);
        sync.update(trading("E", 10, "late"));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    });

    it("ignores edits to emitted rows", async () => {
        const { sync, events } = setup(snapshot("E", "0"));
        sync.connected();
        await vi.advanceTimersByTimeAsync(0);
        events[0]!.balances[0]!.fundingRevision = "100";
        sync.update(funding("11", "6"));
        expect(events.at(-1)?.balances[0]).toMatchObject({ funding: "6", fundingRevision: "11" });
    });

    it("retries a retryable snapshot failure and stops on another", async () => {
        const retryable = setup(new ServiceUnavailableError("busy"), snapshot("E", "0"));
        retryable.sync.connected();
        await vi.advanceTimersByTimeAsync(0);
        expect(retryable.errors).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(250);
        expect(retryable.trading1()).toEqual([["snapshot", "1", "0"]]);

        const fatal = setup(new ValidationError("bad scope"));
        fatal.sync.connected();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(fatal.fetchSnapshot).toHaveBeenCalledTimes(1);
        expect(fatal.errors).toHaveLength(1);
    });
});
