/**
 * Checks if the current environment is development.
 * Uses local-only hostnames to determine if the current environment is development.
 * If the current environment is not a browser environment, it returns false.
 * If the current environment is a browser environment, it checks if the hostname is localhost or loopback.
 * If any of the conditions are true, it returns true.
 * Otherwise, it returns false.
 *
 * @returns true if the current environment is development
 */
function isLoopbackIpv4(hostname: string): boolean {
    const parts = hostname.split(".");
    if (parts.length !== 4 || parts[0] !== "127") return false;

    return parts.every((part) => {
        if (!/^\d+$/.test(part)) return false;
        const octet = Number(part);
        return octet >= 0 && octet <= 255;
    });
}

export function isDev(): boolean {
    if (typeof window === "undefined") return false;
    const hostname = window.location.hostname.toLowerCase();

    return (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname === "::1" ||
        hostname === "[::1]" ||
        isLoopbackIpv4(hostname)
    );
}
