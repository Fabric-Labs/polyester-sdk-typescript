import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["src/index.ts", "src/smart-account/index.ts", "src/gen/**/*.ts"],
    format: "esm",
    target: "es2022",
    platform: "neutral",
    root: "src",
    unbundle: true,
    dts: {
        sourcemap: true,
    },
});
