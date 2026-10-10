import crypto from "crypto";

/** Verifies Shopify's X-Shopify-Hmac-Sha256 header against the raw request body. */
export function verifyShopifyHmac(
  rawBody: Buffer,
  headerValue: string | undefined,
  secret: string
): boolean {
  if (!headerValue) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(headerValue);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface ShopifyOrder {
  id: number;
  name: string; // e.g. "#1001"
  email: string | null;
  total_price: string;
  currency: string;
  customer?: { first_name?: string; last_name?: string; phone?: string } | null;
}
