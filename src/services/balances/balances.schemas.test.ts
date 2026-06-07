import { beforeAll, describe, expect, it } from "vitest";
import { setAssetCatalog } from "../../catalogs/market-data-catalog.js";
import { ASSET_CATALOG } from "../../catalogs/market-data-catalog.generated.js";
import { LedgerBalanceSchema } from "./balances.schemas.js";
import * as v from "valibot";

describe("ledger balance schema", () => {
    beforeAll(() => {
        setAssetCatalog(ASSET_CATALOG);
    });

    it("maps generated trading balances to unified output balances", () => {
        const balance = v.parse(LedgerBalanceSchema, {
            assetId: 1,
            trading: { hi: 0n, lo: 1_000_000_000_000_000_000n },
            funding: { hi: 0n, lo: 0n },
            reserved: { hi: 0n, lo: 0n },
            available: { hi: 0n, lo: 1_000_000_000_000_000_000n },
        });

        expect(balance.asset.symbol).toBe("USDT");
        expect(balance.unified).toBe(1);
        expect(balance.available).toBe(1);
    });
});
