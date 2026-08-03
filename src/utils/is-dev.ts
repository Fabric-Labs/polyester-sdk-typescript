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
function parseIpv4(hostname: string): number[] | null {
    const parts = hostname.split(".");
    if (parts.length !== 4) return null;

    const octets: number[] = [];
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        const octet = Number(part);
        if (octet > 255) return null;
        octets.push(octet);
    }
    return octets;
}

function isLoopbackIpv4(hostname: string): boolean {
    return parseIpv4(hostname)?.[0] === 127;
}

/** RFC 1918 private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. */
function isPrivateIpv4(hostname: string): boolean {
    const octets = parseIpv4(hostname);
    if (!octets) return false;
    const [first, second] = octets as [number, number, number, number];
    return (
        first === 10 ||
        (first === 192 && second === 168) ||
        (first === 172 && second >= 16 && second <= 31)
    );
}

function isLocalhostName(hostname: string): boolean {
    return (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname === "::1" ||
        hostname === "[::1]" ||
        isLoopbackIpv4(hostname)
    );
}

/**
 * Checks whether the current runtime appears to be a development environment.
 */
export function isDev(): boolean {
    if (typeof window === "undefined") return false;
    return isLocalhostName(window.location.hostname.toLowerCase());
}

/**
 * True for hostnames only reachable on a developer's machine or local network:
 * everything `isDev()` accepts plus RFC 1918 private IPv4 addresses, which is
 * how phones reach a dev server over LAN. Production hostnames are public
 * domains and never match.
 */
export function isLocalNetworkHost(hostname: string): boolean {
    const lowered = hostname.toLowerCase();
    return isLocalhostName(lowered) || isPrivateIpv4(lowered);
}
