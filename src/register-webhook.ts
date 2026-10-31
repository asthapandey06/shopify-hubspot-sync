/**
 * One-off: subscribes this deployment to Shopify's orders/create webhook.
 *   PUBLIC_URL=https://your-app.onrender.com npm run register-webhook
 * Webhooks created by an app are signed with that app's client secret, so set
 * SHOPIFY_WEBHOOK_SECRET to the same value as SHOPIFY_CLIENT_SECRET (or your app's secret).
 */
import { adminGraphql } from "./shopifyAdmin";

async function main() {
  const base = process.env.PUBLIC_URL;
  if (!base) throw new Error("Set PUBLIC_URL to your deployed API URL");
  const callbackUrl = `${base.replace(/\/$/, "")}/webhooks/shopify/orders`;

  const r = await adminGraphql<{
    webhookSubscriptionCreate: { webhookSubscription: { id: string } | null; userErrors: { message: string }[] };
  }>(
    `mutation Sub($sub: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: ORDERS_CREATE, webhookSubscription: $sub) {
        webhookSubscription { id }
        userErrors { message }
      }
    }`,
    { sub: { callbackUrl, format: "JSON" } }
  );
  const { webhookSubscription, userErrors } = r.webhookSubscriptionCreate;
  if (!webhookSubscription) throw new Error(userErrors.map((e) => e.message).join("; "));
  console.log(`Subscribed ${callbackUrl} -> ${webhookSubscription.id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
