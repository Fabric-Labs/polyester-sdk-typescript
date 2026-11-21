import { compareUnsignedIntegerStrings } from "../../shared/reconciliation.js";
import { isRetryableError } from "../../utils/errors.js";
import type { LedgerTransfer } from "../transfers/transfers.schemas.js";
import type {
    LedgerBalance,
    LedgerBalanceSnapshot,
    LedgerBalanceUpdate,
    LedgerTradingBalanceUpdate,
} from "./balances.schemas.js";

/** Contract: an incomplete Trading step whose next sequence takes longer than this means reload. */
export const INCOMPLETE_STEP_TIMEOUT_MS = 2_000;
const RETRY_BASE_MS = 250;
const RETRY_MAX_MS = 5_000;

/** One consistent view of the account's balances, emitted by `balances.subscribe`. */
export interface LedgerBalancesEvent {
    /** `snapshot` after a (re)load, `trading` after a complete Trading step, `funding` after a newer Funding balance. */
    kind: "snapshot" | "trading" | "funding";
    /** Every asset's balances after this event. */
    balances: LedgerBalance[];
    tradingEpoch: string;
    tradingSequence: string;
    /** Every Trading transfer whose `tsNs` is at or below this is in `balances`. */
    tradingAppliedThroughTsNs: string;
    /** The Trading transfer legs this step applied, oldest first; empty unless `kind` is `trading`. */
    transfers: LedgerTransfer[];
}

interface BalanceSyncParams {
    fetchSnapshot: () => Promise<LedgerBalanceSnapshot>;
    emit: (event: LedgerBalancesEvent) => void;
    onSnapshotError: (error: unknown) => void;
}

type TradingFields = LedgerTradingBalanceUpdate["balances"][number];

const ZERO_BALANCE = {
    trading: "0",
    reserved: "0",
    available: "0",
    funding: "0",
    fundingRevision: "0",
};

/**
 * Keeps an account's balances exact from the balance stream, as `ledger.read.v1.BalanceUpdate`
 * documents: buffer, seed with `GetBalances`, apply each epoch's Trading steps in sequence, drop
 * repeats and dropped epochs, and reload on a new epoch, a gap or a stalled incomplete step.
 */
export function createBalanceSync(params: BalanceSyncParams) {
    let generation = 0;
    let state: "loading" | "live" | "failed" = "loading";
    let buffer: LedgerBalanceUpdate[] = [];
    // Epochs of every Trading update received; those received before a load began, other than the
    // epoch it answers, are dropped when it answers.
    const epochsSeen = new Set<string>();
    const dropped = new Set<string>();
    let epoch: string | undefined;
    let sequence = 0n;
    let appliedThrough = "0";
    // The position of the last complete step: what `balances` shows.
    let shown = { sequence: "0", appliedThrough: "0" };
    let balances = new Map<number, LedgerBalance>();
    let pending = new Map<number, TradingFields>();
    let pendingTransfers: LedgerTransfer[] = [];
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function emit(kind: LedgerBalancesEvent["kind"], transfers: LedgerTransfer[] = []): void {
        params.emit({
            kind,
            balances: [...balances.values()].map((b) => ({ ...b })),
            tradingEpoch: epoch ?? "0",
            tradingSequence: shown.sequence,
            tradingAppliedThroughTsNs: shown.appliedThrough,
            transfers,
        });
    }

    function stop(): void {
        generation++;
        state = "loading";
        buffer = [];
        pending = new Map();
        pendingTransfers = [];
        clearTimeout(stallTimer);
        clearTimeout(retryTimer);
    }

    function load(attempt = 0): void {
        stop();
        const current = generation;
        const before = [...epochsSeen];
        params.fetchSnapshot().then(
            (snapshot) => {
                if (current !== generation) return;
                if (epoch !== undefined && epoch !== snapshot.tradingEpoch) dropped.add(epoch);
                for (const e of before) if (e !== snapshot.tradingEpoch) dropped.add(e);
                epoch = snapshot.tradingEpoch;
                sequence = BigInt(snapshot.tradingSequence);
                appliedThrough = snapshot.tradingAppliedThroughTsNs;
                balances = new Map(snapshot.balances.map((b) => [b.assetId, b]));
                shown = { sequence: snapshot.tradingSequence, appliedThrough };
                state = "live";
                emit("snapshot");
                const buffered = buffer;
                buffer = [];
                for (const update of buffered) {
                    if (current !== generation) return;
                    apply(update);
                }
            },
            (error: unknown) => {
                if (current !== generation) return;
                params.onSnapshotError(error);
                if (!isRetryableError(error)) {
                    // Wait for the next (re)subscribe rather than buffer without bound.
                    stop();
                    state = "failed";
                    return;
                }
                const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
                retryTimer = setTimeout(() => {
                    if (current === generation) load(attempt + 1);
                }, delay);
            },
        );
    }

    function applyFunding(update: Extract<LedgerBalanceUpdate, { account: "funding" }>): void {
        let changed = false;
        for (const b of update.balances) {
            const held = balances.get(b.assetId);
            if (
                held &&
                compareUnsignedIntegerStrings(b.fundingRevision, held.fundingRevision) <= 0
            ) {
                continue;
            }
            balances.set(b.assetId, { ...ZERO_BALANCE, ...held, ...b });
            changed = true;
        }
        if (changed) emit("funding");
    }

    function applyTrading(update: LedgerTradingBalanceUpdate): void {
        if (dropped.has(update.tradingEpoch)) return;
        if (update.tradingEpoch !== epoch) return load();
        const next = BigInt(update.tradingSequence);
        if (next <= sequence) return;
        if (next !== sequence + 1n) return load();

        sequence = next;
        clearTimeout(stallTimer);
        for (const b of update.balances) pending.set(b.assetId, b);
        pendingTransfers.push(...update.transfers);
        appliedThrough = update.tradingAppliedThroughTsNs;
        if (!update.complete) {
            stallTimer = setTimeout(load, INCOMPLETE_STEP_TIMEOUT_MS);
            return;
        }
        for (const [assetId, b] of pending) {
            balances.set(assetId, { ...ZERO_BALANCE, ...balances.get(assetId), ...b });
        }
        shown = { sequence: next.toString(), appliedThrough };
        const transfers = pendingTransfers;
        pending = new Map();
        pendingTransfers = [];
        emit("trading", transfers);
    }

    function apply(update: LedgerBalanceUpdate): void {
        if (update.account === "funding") applyFunding(update);
        else applyTrading(update);
    }

    return {
        /** On every (re)subscribe: missed publications may not have been recovered, so reload. */
        connected: () => load(),
        disconnected: stop,
        dispose: stop,
        update(update: LedgerBalanceUpdate): void {
            if (state === "failed") return;
            if (update.account === "trading") epochsSeen.add(update.tradingEpoch);
            if (state === "live") apply(update);
            else buffer.push(update);
        },
    };
}
