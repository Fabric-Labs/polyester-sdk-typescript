import * as v from "valibot";
import { isEvmAddress } from "../../utils/evm.js";

export const WalletAddressSchema = v.pipe(
    v.string(),
    v.check(isEvmAddress, "Invalid wallet address."),
);

export const WalletChallengeUriSchema = v.pipe(
    v.string(),
    v.maxLength(2048),
    v.check((value) => {
        try {
            const url = new URL(value);
            return (
                (url.protocol === "https:" || url.protocol === "http:") &&
                url.origin !== "null" &&
                !url.username &&
                !url.password &&
                url.pathname === "/" &&
                !url.search &&
                !url.hash &&
                /^https?:\/\/[^/?#\s\\]+$/.test(value)
            );
        } catch {
            return false;
        }
    }, "Wallet challenge URI must be an HTTP(S) origin without a path, query, fragment, or user information."),
);

/** Preserve the server-issued UTF-8 message exactly as signed. */
export const WalletChallengeMessageSchema = v.pipe(
    v.string(),
    v.minLength(1),
    v.check(
        (value) => new TextEncoder().encode(value).length <= 4096,
        "Wallet challenge message exceeds 4096 UTF-8 bytes.",
    ),
);

export const WalletSignatureSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(8192));
