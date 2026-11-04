import { describe, expect, it } from "vitest";
import { subaccountResolverStub, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { FeesService } from "./fees.js";

describe("FeesService", () => {
    it("resolves the account target and parses spot fee rows", async () => {
        const transport = unaryTransport({
            feeRates: [
                {
                    symbolId: 101,
                    makerFeeRatePercent: "0.02",
                    takerFeeRatePercent: "0.05",
                    vipTier: 2,
                    reserveFeeRatePercent: "0.1",
                    postOnlyReserveFeeRatePercent: "0.04",
                    breakdown: {
                        tierMakerFeeRatePercent: "0.02",
                        tierTakerFeeRatePercent: "0.05",
                        accountDiscounts: [],
                    },
                },
            ],
        });
        const service = new FeesService(
            { authApi: transport.transport },
            subaccountResolverStub(formatId(42n)),
        );
        const signal = new AbortController().signal;

        await expect(service.getSpotRates({ symbolIds: [101] }, { signal })).resolves.toEqual([
            {
                symbolId: 101,
                makerFeeRatePercent: "0.02",
                takerFeeRatePercent: "0.05",
                vipTier: 2,
                reserveFeeRatePercent: "0.1",
                postOnlyReserveFeeRatePercent: "0.04",
                breakdown: {
                    tierMakerFeeRatePercent: "0.02",
                    tierTakerFeeRatePercent: "0.05",
                    marketMultiplier: undefined,
                    accountDiscounts: [],
                    referralDiscount: undefined,
                },
                nextChangeAt: undefined,
            },
        ]);

        expect(transport.lastCall()?.message).toEqual({ subaccountId: 42n, symbolId: [101] });
        expect(transport.lastCall()?.signal).toBe(signal);
    });

    it("lets explicit main scope force root scope and omits an empty symbol filter", async () => {
        const transport = unaryTransport({ feeRates: [] });
        const service = new FeesService(
            { authApi: transport.transport },
            subaccountResolverStub(formatId(42n)),
        );

        await expect(service.getSpotRates({ account: "main" })).resolves.toEqual([]);
        expect(transport.lastCall()?.message).toEqual({ symbolId: [] });
    });
});
