import { defineConfig } from "tsdown";

export default defineConfig({
    entry: [
        "src/index.ts",
        "src/catalogs/index.ts",
        "src/smart-account/index.ts",
        "src/server-session.ts",
        "src/account-signer/index.ts",
        "src/shared/errors.ts",
        "src/gen/index.ts",
        "src/gen/**/*_pb.ts",
        "src/wired-services.ts",
    ],
    format: "esm",
    target: "es2022",
    platform: "neutral",
    root: "src",
    clean: true,
    unbundle: true,
    dts: {
        sourcemap: true,
    },
});
