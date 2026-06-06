import { z } from "zod";

export const TimestampSchema = z.object({
	seconds: z.bigint(),
	nanos: z.number().optional().default(0),
});
