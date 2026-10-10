import express from "express";
import { config } from "./config";
import { orderQueue } from "./queue";
import { verifyShopifyHmac, ShopifyOrder } from "./shopify";

const app = express();

app.get("/health", (_req, res) => res.json({ ok: true }));

// Raw body is required: the HMAC is computed over the exact bytes Shopify sent.
app.post(
  "/webhooks/shopify/orders",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const valid = verifyShopifyHmac(
      req.body,
      req.header("X-Shopify-Hmac-Sha256"),
      config.SHOPIFY_WEBHOOK_SECRET
    );
    if (!valid) return res.status(401).send("Invalid signature");

    const order = JSON.parse(req.body.toString("utf8")) as ShopifyOrder;
    const webhookId = req.header("X-Shopify-Webhook-Id");

    // Reusing the webhook id as the job id means Shopify retries/duplicates are ignored.
    await orderQueue.add("sync-order", order, webhookId ? { jobId: webhookId } : undefined);

    // Acknowledge fast; the real work happens in the worker.
    res.status(200).send("queued");
  }
);

app.listen(config.PORT, () => console.log(`API listening on :${config.PORT}`));
