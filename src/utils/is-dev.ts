/**
 * Checks if the current environment is development.
 * Uses a simple heuristic to determine if the current environment is development.
 * If the current environment is not a browser environment, it returns false.
 * If the current environment is a browser environment, it checks if the hostname is localhost, 127.0.0.1, or the port is not empty.
 * If any of the conditions are true, it returns true.
 * Otherwise, it returns false.
 *
 * @returns true if the current environment is development
 */
export function isDev(): boolean {
	if (typeof window === "undefined") return false;
	return (
		window.location.hostname === "localhost" ||
		window.location.hostname === "127.0.0.1" ||
		window.location.port !== ""
	);
}
