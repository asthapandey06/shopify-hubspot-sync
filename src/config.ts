import "dotenv/config";
import { z } from "zod";

const optional = z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SHOPIFY_WEBHOOK_SECRET: z.string().min(1),
  HUBSPOT_ACCESS_TOKEN: z.string().min(1),

  // ---- Live portfolio demo (optional). Leave SHOPIFY_SHOP empty to disable /demo routes. ----
  SHOPIFY_SHOP: optional, // e.g. my-dev-store.myshopify.com
  SHOPIFY_ADMIN_TOKEN: optional, // Admin API access token with write_orders
  SHOPIFY_CLIENT_ID: optional, // alternative to SHOPIFY_ADMIN_TOKEN: client credentials grant
  SHOPIFY_CLIENT_SECRET: optional,
  SHOPIFY_API_VERSION: z.string().default("2026-07"),
  DEMO_ALLOWED_ORIGINS: z.string().default("https://asthapandey06.github.io,http://localhost:8080"),
  DEMO_PER_IP_LIMIT: z.coerce.number().default(3), // orders per IP per 10 minutes
  DEMO_DAILY_LIMIT: z.coerce.number().default(60), // orders per day, all visitors
  HUBSPOT_PORTAL_ID: optional, // shown on the demo page so visitors can see it's a real portal
});

export const config = schema.parse(process.env);
export const demoEnabled = Boolean(
  config.SHOPIFY_SHOP && (config.SHOPIFY_ADMIN_TOKEN || (config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET))
);
