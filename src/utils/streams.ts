import { type DescMessage, type MessageShape, fromBinary } from "@bufbuild/protobuf";

/**
 * Decode a proto frame from a WS payload.
 * @param schema - The schema to decode the frame into.
 * @param m - The message to decode.
 * @returns The decoded frame, or null if the frame is invalid.
 */
export function decodeProtoFrame<T extends DescMessage>(
	schema: T,
	m: Uint8Array | MessageShape<T>
): MessageShape<T> | null {
	if (!m) return null;

	try {
		if (m instanceof Uint8Array) return fromBinary(schema, m);
		if (m && typeof m === "object") return m;
		return null;
	} catch {
		return null;
	}
}
