import { describe, expect, it, vi } from "vitest";
import { buildProtoPatch, defineProtoPatchFields } from "./proto-patch.js";

type TestPatch = {
    label?: string;
    limit?: number | null;
    enabled?: boolean;
    tags?: string[];
    expiresAt?: number | null;
};

const fields = defineProtoPatchFields<TestPatch>()({
    label: {
        path: "label",
        encode: (label) => ({ label }),
    },
    limit: {
        path: "order_limit",
        encode: (limit) => ({ orderLimit: limit ?? 0 }),
    },
    enabled: {
        path: "enabled",
        encode: (enabled) => ({ enabled }),
    },
    tags: {
        path: "tag_ids",
        encode: (tags) => ({ tagIds: tags }),
    },
    expiresAt: {
        path: "expires_at",
        encode: (expiresAt) => (expiresAt === null ? {} : { expiresAt }),
    },
});

describe("buildProtoPatch", () => {
    it("encodes present fields and their mask paths together", () => {
        expect(buildProtoPatch({ label: "Renamed", limit: null }, fields)).toEqual({
            patch: { label: "Renamed", orderLimit: 0 },
            updateMask: { paths: ["label", "order_limit"] },
        });
    });

    it.each([
        ["null", { limit: null }, { orderLimit: 0 }, ["order_limit"]],
        ["false", { enabled: false }, { enabled: false }, ["enabled"]],
        ["zero", { limit: 0 }, { orderLimit: 0 }, ["order_limit"]],
        ["an empty string", { label: "" }, { label: "" }, ["label"]],
        ["an empty array", { tags: [] }, { tagIds: [] }, ["tag_ids"]],
    ])("treats %s as a present value", (_description, input, patch, paths) => {
        expect(buildProtoPatch(input, fields)).toEqual({
            patch,
            updateMask: { paths },
        });
    });

    it("keeps an explicit clear in the mask when its encoder emits no proto fields", () => {
        expect(buildProtoPatch({ expiresAt: null }, fields)).toEqual({
            patch: {},
            updateMask: { paths: ["expires_at"] },
        });
    });

    it.each([{}, { label: undefined, limit: undefined }])(
        "omits absent and explicitly undefined fields",
        (input) => {
            expect(buildProtoPatch(input, fields)).toEqual({
                patch: {},
                updateMask: { paths: [] },
            });
        },
    );

    it("supports an encoder that renames or emits multiple proto fields", () => {
        type WindowPatch = { window?: number };
        const windowFields = defineProtoPatchFields<WindowPatch>()({
            window: {
                path: "window",
                encode: (window) => ({ windowStart: window, windowEnd: window + 10 }),
            },
        });

        expect(buildProtoPatch({ window: 5 }, windowFields)).toEqual({
            patch: { windowStart: 5, windowEnd: 15 },
            updateMask: { paths: ["window"] },
        });
    });

    it("uses descriptor declaration order regardless of input property order", () => {
        const input: TestPatch = {};
        input.tags = ["risk"];
        input.enabled = true;
        input.label = "Desk";

        expect(buildProtoPatch(input, fields)).toEqual({
            patch: { label: "Desk", enabled: true, tagIds: ["risk"] },
            updateMask: { paths: ["label", "enabled", "tag_ids"] },
        });
    });

    it("does not mutate the input or descriptor map", () => {
        const input = Object.freeze<TestPatch>({
            label: "Unchanged",
            tags: Object.freeze(["one"]) as unknown as string[],
        });
        const descriptorsBefore = Object.getOwnPropertyDescriptors(fields);

        buildProtoPatch(input, fields);

        expect(input).toEqual({ label: "Unchanged", tags: ["one"] });
        expect(Object.getOwnPropertyDescriptors(fields)).toEqual(descriptorsBefore);
    });

    it("calls each present field encoder exactly once and skips omitted encoders", () => {
        type CountedPatch = { present?: number; omitted?: number };
        const present = vi.fn((value: number) => ({ present: value }));
        const omitted = vi.fn((value: number) => ({ omitted: value }));
        const countedFields = defineProtoPatchFields<CountedPatch>()({
            present: { path: "present", encode: present },
            omitted: { path: "omitted", encode: omitted },
        });

        buildProtoPatch({ present: 0 }, countedFields);

        expect(present).toHaveBeenCalledOnce();
        expect(present).toHaveBeenCalledWith(0);
        expect(omitted).not.toHaveBeenCalled();
    });

    it("ignores own and inherited input properties that have no descriptor", () => {
        const prototype = { inheritedExtra: "ignore me" };
        const input: TestPatch = Object.assign(Object.create(prototype) as TestPatch, {
            label: "Included",
            ownExtra: "ignore me too",
        });

        expect(buildProtoPatch(input, fields)).toEqual({
            patch: { label: "Included" },
            updateMask: { paths: ["label"] },
        });
    });

    it("returns fresh patch, mask, and paths containers for every invocation", () => {
        const first = buildProtoPatch({ label: "First" }, fields);
        const second = buildProtoPatch({ label: "Second" }, fields);

        expect(first).not.toBe(second);
        expect(first.patch).not.toBe(second.patch);
        expect(first.updateMask).not.toBe(second.updateMask);
        expect(first.updateMask.paths).not.toBe(second.updateMask.paths);

        first.updateMask.paths.push("mutated");
        Object.assign(first.patch, { extra: true });
        expect(second).toEqual({
            patch: { label: "Second" },
            updateMask: { paths: ["label"] },
        });
    });

    it("propagates encoder errors without returning a partial result", () => {
        const failure = new Error("cannot encode field");
        type InvalidPatch = { value?: string };
        const invalidFields = defineProtoPatchFields<InvalidPatch>()({
            value: {
                path: "value",
                encode: () => {
                    throw failure;
                },
            },
        });

        expect(() => buildProtoPatch({ value: "bad" }, invalidFields)).toThrow(failure);
    });
});
