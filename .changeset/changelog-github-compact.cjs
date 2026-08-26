"use strict";

// CommonJS entry for `@changesets/cli` 2.31, which `require()`s the changelog
// module. Implementation lives in `scripts/changelog-github-compact.ts`.
const loaded = require("../scripts/changelog-github-compact.ts");
module.exports = loaded.default ?? loaded;
