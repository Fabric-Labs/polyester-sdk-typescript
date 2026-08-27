import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "./event-emitter.js";

interface TestEvents {
    update: string;
}

describe("EventEmitter", () => {
    it("isolates listener errors and continues notifying later listeners", () => {
        const emitter = new EventEmitter<TestEvents>();
        const laterListener = vi.fn();

        emitter.on("update", () => {
            throw new Error("listener failed");
        });
        emitter.on("update", laterListener);

        expect(() => emitter.emit("update", "ready")).not.toThrow();
        expect(laterListener).toHaveBeenCalledOnce();
        expect(laterListener).toHaveBeenCalledWith("ready");
    });

    it("defers listeners re-armed during an emission until the next event", () => {
        const emitter = new EventEmitter<TestEvents>();
        const listener = vi.fn(() => {
            emitter.once("update", listener);
        });
        emitter.once("update", listener);

        emitter.emit("update", "first");
        expect(listener).toHaveBeenCalledOnce();

        emitter.emit("update", "second");
        expect(listener).toHaveBeenCalledTimes(2);
    });
});
