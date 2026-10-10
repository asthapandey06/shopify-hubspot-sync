import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SHOPIFY_WEBHOOK_SECRET: z.string().min(1),
  HUBSPOT_ACCESS_TOKEN: z.string().min(1),
});

export const config = schema.parse(process.env);
