import { ErrorCode, ErrorDetailSchema } from "../../gen/strategies/v1/strategies_pb.js";
import { NotBacktestableReasonCodec } from "../../services/strategies/strategies.codecs.js";
import { tsObjToMs } from "../../utils/time.js";
import { enumLabel } from "../proto-enum-codec.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const strategies = decodeDetail(raw, ErrorDetailSchema);
    const code = strategies && codeName(ErrorCode, strategies.code);
    if (!code) return undefined;
    const detail: PolyesterErrorDetail = { service: "strategies", code };
    if (strategies.fieldPath) detail.fieldPath = strategies.fieldPath;
    const retryAfter = tsObjToMs(strategies.retryAfter);
    if (retryAfter !== undefined) detail.retryAfter = retryAfter;
    if (strategies.botCap) {
        const { vipTier, botCap, bots, nextVipTier, nextBotCap } = strategies.botCap;
        detail.botCap = { vipTier, botCap, bots, nextVipTier, nextBotCap };
    }
    if (strategies.strategyCap) {
        const { strategyCap, strategies: count } = strategies.strategyCap;
        detail.strategyCap = { strategyCap, strategies: count };
    }
    if (strategies.revisionConflict) {
        const { revision, headVersionId } = strategies.revisionConflict;
        detail.revisionConflict = { revision: revision.toString(), headVersionId };
    }
    if (strategies.notesConflict) {
        detail.notesConflict = { notesRevision: strategies.notesConflict.notesRevision.toString() };
    }
    if (strategies.backtestLimit) {
        const { dailyLimit, dailyUsed, activeLimit, active } = strategies.backtestLimit;
        detail.backtestLimit = { dailyLimit, dailyUsed, activeLimit, active };
    }
    if (strategies.notBacktestableReason) {
        detail.notBacktestableReason = enumLabel(
            NotBacktestableReasonCodec.protoToOutput,
            strategies.notBacktestableReason,
        );
    }
    if (strategies.markets.length > 0) detail.markets = strategies.markets;
    if (strategies.shortfall.length > 0) {
        detail.shortfall = strategies.shortfall.map(({ asset, amount }) => ({ asset, amount }));
    }
    return detail;
}
