import crypto from "crypto";
import { config } from "./config";

let cached: { token: string; expiresAt: number } | null = null;

/**
 * Admin API token. Uses SHOPIFY_ADMIN_TOKEN if set, otherwise the client credentials
 * grant (for an app you created in the Shopify Dev Dashboard and installed on your own store).
 */
async function adminToken(): Promise<string> {
  if (config.SHOPIFY_ADMIN_TOKEN) return config.SHOPIFY_ADMIN_TOKEN;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(`https://${config.SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.SHOPIFY_CLIENT_ID!,
      client_secret: config.SHOPIFY_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) throw new Error(`Shopify token request failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export async function adminGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(
    `https://${config.SHOPIFY_SHOP}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await adminToken() },
      body: JSON.stringify({ query, variables }),
    }
  );
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || body.errors || !body.data) {
    throw new Error(`Shopify Admin API error ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.data;
}

const FIRST = ["Aarav", "Maya", "Liam", "Sofia", "Noah", "Zara", "Ethan", "Ava", "Kabir", "Mia"];
const LAST = ["Patel", "Garcia", "Smith", "Khan", "Rossi", "Müller", "Tanaka", "Brown", "Silva", "Cohen"];
const PRODUCTS = [
  { title: "Ceramic Pour-Over Set", price: "48.00" },
  { title: "Linen Tote Bag", price: "29.00" },
  { title: "Cold Brew Bottle", price: "34.50" },
  { title: "Walnut Desk Organizer", price: "62.00" },
  { title: "Merino Travel Scarf", price: "55.00" },
];
const pick = <T>(a: T[]) => a[crypto.randomInt(a.length)];

export interface DemoOrder {
  orderId: string; // numeric id, matches the webhook payload's "id"
  name: string; // "#1012"
  email: string;
  customerName: string;
  product: string;
  total: string;
}

/** Creates a real (test) order in the dev store with an invented customer. No visitor data is used. */
export async function createDemoOrder(): Promise<DemoOrder> {
  const first = pick(FIRST);
  const last = pick(LAST);
  const product = pick(PRODUCTS);
  const qty = 1 + crypto.randomInt(2);
  const email = `demo+${crypto.randomBytes(4).toString("hex")}@example.com`;

  const data = await adminGraphql<{
    orderCreate: {
      order: { legacyResourceId: string; name: string; totalPriceSet: { shopMoney: { amount: string } } } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    `mutation DemoOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order { legacyResourceId name totalPriceSet { shopMoney { amount } } }
        userErrors { field message }
      }
    }`,
    {
      order: {
        email,
        currency: "USD",
        financialStatus: "PAID",
        tags: ["portfolio-demo"],
        customer: { toUpsert: { email, firstName: first, lastName: last } },
        lineItems: [
          {
            title: product.title,
            quantity: qty,
            priceSet: { shopMoney: { amount: product.price, currencyCode: "USD" } },
          },
        ],
      },
      options: { sendReceipt: false, sendFulfillmentReceipt: false, inventoryBehaviour: "BYPASS" },
    }
  );

  const { order, userErrors } = data.orderCreate;
  if (!order) throw new Error(`orderCreate failed: ${userErrors.map((e) => e.message).join("; ")}`);

  return {
    orderId: order.legacyResourceId,
    name: order.name,
    email,
    customerName: `${first} ${last}`,
    product: `${qty} × ${product.title}`,
    total: order.totalPriceSet.shopMoney.amount,
  };
}
