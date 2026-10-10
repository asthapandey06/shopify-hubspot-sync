import { UnrecoverableError } from "bullmq";
import { config } from "./config";
import type { ShopifyOrder } from "./shopify";

const BASE = "https://api.hubapi.com";
// HubSpot-defined association type id: deal -> contact
const DEAL_TO_CONTACT = 3;

async function hs<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.ok) return (await res.json()) as T;

  const text = await res.text();
  // 429 and 5xx are transient: throw normally so BullMQ retries with backoff.
  if (res.status === 429 || res.status >= 500) {
    throw new Error(`HubSpot ${res.status} (retryable): ${text}`);
  }
  // Other 4xx (bad data, bad scopes) will never succeed on retry: fail fast.
  throw new UnrecoverableError(`HubSpot ${res.status}: ${text}`);
}

async function findContactId(email: string): Promise<string | null> {
  const r = await hs<{ results: { id: string }[] }>("POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
    limit: 1,
  });
  return r.results[0]?.id ?? null;
}

async function upsertContact(order: ShopifyOrder): Promise<string> {
  const properties = {
    email: order.email!,
    firstname: order.customer?.first_name ?? "",
    lastname: order.customer?.last_name ?? "",
    phone: order.customer?.phone ?? "",
  };
  const existing = await findContactId(order.email!);
  if (existing) {
    await hs("PATCH", `/crm/v3/objects/contacts/${existing}`, { properties });
    return existing;
  }
  const created = await hs<{ id: string }>("POST", "/crm/v3/objects/contacts", { properties });
  return created.id;
}

async function dealExists(dealName: string): Promise<boolean> {
  const r = await hs<{ total: number }>("POST", "/crm/v3/objects/deals/search", {
    filterGroups: [{ filters: [{ propertyName: "dealname", operator: "EQ", value: dealName }] }],
    limit: 1,
  });
  return r.total > 0;
}

/** Idempotent: safe to run more than once for the same order. */
export async function syncOrderToHubSpot(order: ShopifyOrder): Promise<void> {
  if (!order.email) throw new UnrecoverableError(`Order ${order.name} has no email; skipping`);

  const contactId = await upsertContact(order);
  const dealName = `Shopify Order ${order.name}`;
  if (await dealExists(dealName)) return;

  await hs("POST", "/crm/v3/objects/deals", {
    properties: {
      dealname: dealName,
      amount: order.total_price,
      dealstage: "closedwon", // default pipeline stage id
      pipeline: "default",
    },
    associations: [
      {
        to: { id: contactId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: DEAL_TO_CONTACT }],
      },
    ],
  });
}
