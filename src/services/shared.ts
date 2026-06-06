import { z } from "zod";

export const SideSchema = z.enum(["buy", "sell"]);
