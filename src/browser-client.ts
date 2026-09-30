import { installServiceGetters, type PolyesterServices } from "./client.js";
import { PolyesterBrowserCore } from "./browser-core.js";

export type { PolyesterBrowserClientConfig } from "./browser-core.js";

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- getters are installed below
export interface PolyesterBrowserClient extends PolyesterServices {}

/**
 * A client for interacting with the Polyester DEX in the browser, with a lazy
 * getter for every public service.
 */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- getters are installed below
export class PolyesterBrowserClient extends PolyesterBrowserCore {
    static {
        installServiceGetters(this);
    }
}
