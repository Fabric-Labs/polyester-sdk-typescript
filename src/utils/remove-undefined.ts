/**
 * Given an object, return a new object with all undefined values removed from it.
 * This is useful for removing undefined values from the object before sending it to the server.
 */
export function removeUndefined<T extends Record<string, unknown>>(obj: T): T {
	return Object.fromEntries(Object.entries(obj).filter(([_, value]) => value !== undefined)) as T;
}
