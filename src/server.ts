import express from "express";
import { config } from "./config";
import { orderQueue } from "./queue";
import { verifyShopifyHmac, ShopifyOrder } from "./shopify";
import { recordEvent } from "./events";
import { demoRouter } from "./demo";

export function startApi() {
  const app = express();
  app.set("trust proxy", 1); // behind Render / a load balancer: use X-Forwarded-For for rate limits

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/demo", demoRouter);

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
      await recordEvent(order.id, {
        step: "Webhook received, HMAC signature verified",
        detail: `orders/create · webhook id ${webhookId ?? "n/a"}`,
        status: "ok",
      });

      // Reusing the webhook id as the job id means Shopify retries/duplicates are ignored.
      const job = await orderQueue.add("sync-order", order, webhookId ? { jobId: webhookId } : undefined);
      await recordEvent(order.id, {
        step: "Queued in Redis (BullMQ), Shopify acknowledged with 200",
        detail: `job ${job.id} · up to 5 attempts with exponential backoff`,
        status: "ok",
      });

      // Acknowledge fast; the real work happens in the worker.
      res.status(200).send("queued");
    }
  );

  return app.listen(config.PORT, () => console.log(`API listening on :${config.PORT}`));
}

if (require.main === module) startApi();
