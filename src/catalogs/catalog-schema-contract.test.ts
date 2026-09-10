import { expectTypeOf, it } from "vitest";
import type { Message } from "@bufbuild/protobuf";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import type * as v from "valibot";
import type { GetSpotConfigResponse } from "../gen/marketdata/v1/marketdata_pb.js";
import type { GetDepositWithdrawConfigResponse } from "../gen/chain/zipper/v1/zipper_pb.js";
import type { SpotConfigSchema } from "../services/market-data/market-data.schemas.js";
import type { DepositWithdrawConfigSchema } from "../services/zipper/zipper.schemas.js";
import type { SpotConfig, DepositWithdrawConfig } from "../shared/catalog-config.js";
import type { CatalogSnapshotShapeSchema } from "./snapshot-validation.js";
import type { CatalogSnapshot } from "./types.js";

// Assignability alone permits missing optional fields and extra backend properties.
// Walk nested records and arrays so additions at any catalog depth require a schema entry.
// Timestamps are deliberately parsed as unknown by the timestamp normalizer.
type MissingFields<Expected, Actual> =
    NonNullable<Expected> extends Timestamp
        ? never
        : NonNullable<Expected> extends readonly (infer E)[]
          ? NonNullable<Actual> extends readonly (infer A)[]
              ? MissingFields<E, A>
              : "[]"
          : NonNullable<Expected> extends object
            ? {
                  [K in Exclude<keyof NonNullable<Expected>, keyof Message> &
                      string]-?: K extends keyof NonNullable<Actual>
                      ? MissingFields<
                            NonNullable<Expected>[K],
                            NonNullable<Actual>[K]
                        > extends infer Missing extends string
                          ? `${K}.${Missing}`
                          : never
                      : K;
              }[Exclude<keyof NonNullable<Expected>, keyof Message> & string]
            : never;

type MarketOutput = v.InferOutput<typeof SpotConfigSchema>;
type ZipperOutput = v.InferOutput<typeof DepositWithdrawConfigSchema>;
type SnapshotOutput = v.InferOutput<typeof CatalogSnapshotShapeSchema>;

it("covers every generated backend catalog field in the wire schemas", () => {
    expectTypeOf<
        MissingFields<GetSpotConfigResponse, v.InferInput<typeof SpotConfigSchema>>
    >().toEqualTypeOf<never>();
    expectTypeOf<
        MissingFields<
            GetDepositWithdrawConfigResponse,
            v.InferInput<typeof DepositWithdrawConfigSchema>
        >
    >().toEqualTypeOf<never>();
    expectTypeOf<GetSpotConfigResponse>().toExtend<v.InferInput<typeof SpotConfigSchema>>();
    expectTypeOf<GetDepositWithdrawConfigResponse>().toExtend<
        v.InferInput<typeof DepositWithdrawConfigSchema>
    >();
});

it("preserves normalized schema fields in the public config types", () => {
    expectTypeOf<MissingFields<MarketOutput, SpotConfig>>().toEqualTypeOf<never>();
    expectTypeOf<MissingFields<ZipperOutput, DepositWithdrawConfig>>().toEqualTypeOf<never>();
    expectTypeOf<MarketOutput>().toExtend<SpotConfig>();
    expectTypeOf<ZipperOutput>().toExtend<DepositWithdrawConfig>();
});

it("preserves config fields through enrichment and snapshot validation", () => {
    type MarketCatalog = CatalogSnapshot["market"];
    type ZipperCatalog = CatalogSnapshot["zipper"];
    // Asset symbols become objects and zipper variants become enriched chains.
    type EnrichedMarket = Omit<SpotConfig, "pairs"> & {
        pairs: (Omit<SpotConfig["pairs"][number], "baseAsset" | "quoteAsset"> & {
            baseAsset: SpotConfig["assets"][number];
            quoteAsset: SpotConfig["assets"][number];
        })[];
    };
    type EnrichedZipper = Omit<DepositWithdrawConfig, "assets"> & {
        assets: (Omit<DepositWithdrawConfig["assets"][number], "variants"> & {
            chains: (DepositWithdrawConfig["assets"][number]["variants"][number] &
                DepositWithdrawConfig["chains"][number])[];
        })[];
    };
    expectTypeOf<MissingFields<EnrichedMarket, MarketCatalog>>().toEqualTypeOf<never>();
    expectTypeOf<MissingFields<EnrichedZipper, ZipperCatalog>>().toEqualTypeOf<never>();
    expectTypeOf<MissingFields<CatalogSnapshot, SnapshotOutput>>().toEqualTypeOf<never>();
    expectTypeOf<SnapshotOutput>().toExtend<CatalogSnapshot>();
});

it("detects missing optional and nested backend fields", () => {
    type Backend = { optional?: string; nested: { entries: { added?: number }[] } };
    type Schema = { nested: { entries: {}[] } };
    expectTypeOf<MissingFields<Backend, Schema>>().toEqualTypeOf<
        "optional" | "nested.entries.added"
    >();
});
