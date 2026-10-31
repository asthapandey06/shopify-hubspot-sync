# Shopify → HubSpot Order Sync

A small, production-style integration that turns every new Shopify order into a **HubSpot contact + closed-won deal**, automatically.

Built to demonstrate the parts of integration work that usually break in the real world: webhook security, duplicate events, rate limits, and retries.

> This is an original demo project built with mock data and free developer accounts.

## The problem

Store owners often copy order and customer data into their CRM by hand, or use fragile no-code zaps that silently drop events. This service makes the sync reliable and observable.

## How it works

```mermaid
flowchart LR
  A[Shopify order webhook] --> B[API: verify HMAC]
  B -->|enqueue| C[(Redis / BullMQ)]
  C --> D[Worker x5 concurrent]
  D --> E[HubSpot: upsert contact]
  E --> F[HubSpot: create deal + associate]
  D -.retry with backoff.-> C
```

## Reliability features

- **Webhook signature verification** (HMAC-SHA256, timing-safe) so only Shopify can trigger syncs
- **Fast acknowledgement:** the API responds immediately and does the real work in a queue, so Shopify never times out
- **Deduplication:** Shopify's webhook id is used as the job id, so retried webhooks are ignored
- **Idempotent sync:** contacts are upserted by email and deals are checked before creation, so reprocessing never creates duplicates
- **Smart retries:** exponential backoff (2s, 4s, 8s...) for rate limits (429) and server errors (5xx); permanent errors (bad data, missing scopes) fail immediately instead of retrying forever
- **Concurrent workers** for throughput; failed jobs are retained for inspection
- **Validated config** with Zod; fails at startup if a secret is missing

## Live demo on the portfolio site

[asthapandey06.github.io](https://asthapandey06.github.io/#live) has a **Place a test order** button wired to this exact code, running against a Shopify development store and a HubSpot test portal:

1. `POST /demo/orders` creates a real order through the Shopify Admin GraphQL API (invented customer, no visitor data).
2. Shopify fires the signed `orders/create` webhook back to this server, which verifies it and queues it.
3. The worker upserts the HubSpot contact and creates the deal; each step is written to a short-lived Redis timeline.
4. The page polls `GET /demo/orders/:id/events` and shows the steps with real record IDs.

Visitors can tick **Simulate a HubSpot outage** to force a retryable 429 on the first attempt and watch the backoff path run. Requests are rate-limited per visitor (IPs are hashed, never stored) and per day.

### Deploy it yourself (free tier)

1. **Shopify:** create a development store, then an app with the `write_orders` and `read_orders` scopes installed on that store. Put the store domain in `SHOPIFY_SHOP` and either the Admin API token in `SHOPIFY_ADMIN_TOKEN` or the app's client id/secret in `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`.
2. **HubSpot:** a free developer test account with a Private App (contacts + deals read/write). Token goes in `HUBSPOT_ACCESS_TOKEN`.
3. **Render:** create a free **Key Value** (Redis) instance, then deploy this repo with `render.yaml` and paste the values above plus `REDIS_URL`.
4. **Webhook:** `PUBLIC_URL=https://<your-app>.onrender.com npm run register-webhook`, and set `SHOPIFY_WEBHOOK_SECRET` to the app's client secret (app webhooks are signed with it).
5. On the site, set `LIVE_API` in `index.html` to your Render URL.

Free Render services sleep when idle, so the first click after a quiet period waits ~50 seconds while it wakes up; the page says so.

## Tech stack

Node.js 20, TypeScript, Express, BullMQ, Redis, HubSpot CRM API v3, Docker

## Run it locally

1. **Accounts (all free):** a Shopify development store and a HubSpot developer/test account.
2. **HubSpot:** create a Private App with `crm.objects.contacts.read/write` and `crm.objects.deals.read/write` scopes, and copy the token.
3. **Configure:**
   ```bash
   cp .env.example .env   # fill in SHOPIFY_WEBHOOK_SECRET and HUBSPOT_ACCESS_TOKEN (demo vars optional)
   ```
4. **Start everything:**
   ```bash
   docker compose up --build
   ```
5. **Expose your API** (for example `ngrok http 3000`) and add a Shopify webhook for **Order creation** pointing to `https://<your-url>/webhooks/shopify/orders`.
6. Place a test order and watch the worker logs. The contact and deal appear in HubSpot.

Without Docker: run Redis locally, then `npm install`, `npm run dev:api` and `npm run dev:worker`.

## Project structure

```
src/
  server.ts           Webhook endpoint, signature check, enqueue
  queue.ts            BullMQ queue and retry policy
  worker.ts           Job processor (concurrency 5)
  hubspot.ts          HubSpot client, upsert logic, error classification
  shopify.ts          HMAC verification and order types
  shopifyAdmin.ts     Admin GraphQL client, demo order creation
  demo.ts             Public demo endpoints: CORS, rate limits, timeline
  events.ts           Redis-backed step timeline and counters
  register-webhook.ts One-off orders/create subscription
  all.ts              API + worker in one process for single-instance hosting
  config.ts           Validated environment config
```

## Ideas for extension

- Map line items to HubSpot products
- Handle refunds/cancellations by updating the deal stage
- Add a small dashboard for failed jobs (Bull Board)
- Two-way sync: push HubSpot contact updates back to Shopify

## Need something like this?

I build reliable integrations between Shopify, WooCommerce, HubSpot, Dynamics 365 and other business tools.
Reach me on [LinkedIn](https://www.linkedin.com/in/astha-p-shukla-b398b2213) or at astha.61097@gmail.com.
