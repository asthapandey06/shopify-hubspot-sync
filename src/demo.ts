import crypto from "crypto";
import express, { Request, Response, NextFunction } from "express";
import { config, demoEnabled } from "./config";
import { connection } from "./queue";
import { createDemoOrder } from "./shopifyAdmin";
import { recordEvent, readEvents, readStats } from "./events";

/** Public endpoints for the live demo on the portfolio site. */
export const demoRouter = express.Router();
const allowed = config.DEMO_ALLOWED_ORIGINS.split(",").map((o) => o.trim());

demoRouter.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.header("Origin");
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
demoRouter.use(express.json({ limit: "2kb" }));

demoRouter.get("/status", async (_req, res) => {
  res.json({
    enabled: demoEnabled,
    shop: demoEnabled ? config.SHOPIFY_SHOP : null,
    hubspotPortalId: config.HUBSPOT_PORTAL_ID ?? null,
    stats: await readStats(),
  });
});

/** Hashed so raw visitor IPs are never stored. */
const ipKey = (req: Request) =>
  crypto.createHash("sha256").update(`${req.ip}|${config.SHOPIFY_WEBHOOK_SECRET}`).digest("hex").slice(0, 16);

async function underLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const n = await connection.incr(key);
  if (n === 1) await connection.expire(key, windowSec);
  return n <= limit;
}

demoRouter.post("/orders", async (req, res) => {
  if (!demoEnabled) return res.status(503).json({ error: "Live demo is not configured" });

  const day = new Date().toISOString().slice(0, 10);
  if (!(await underLimit(`demo:rl:ip:${ipKey(req)}`, config.DEMO_PER_IP_LIMIT, 600))) {
    return res.status(429).json({ error: "You've placed a few orders already. Try again in 10 minutes." });
  }
  if (!(await underLimit(`demo:rl:day:${day}`, config.DEMO_DAILY_LIMIT, 86_400))) {
    return res.status(429).json({ error: "The demo has hit today's limit. It resets at midnight UTC." });
  }

  try {
    const order = await createDemoOrder();
    if (req.body?.outage === true) await connection.set(`demo:chaos:${order.orderId}`, "1", "EX", 3600);
    await recordEvent(order.orderId, {
      step: "Order created in Shopify (Admin GraphQL API)",
      detail: `${order.name} · ${order.customerName} · ${order.product} · $${order.total}`,
      status: "ok",
    });
    res.status(201).json(order);
  } catch (err) {
    console.error("demo order failed:", err);
    res.status(502).json({ error: "Shopify did not accept the order. Please try again shortly." });
  }
});

demoRouter.get("/orders/:id/events", async (req, res) => {
  if (!/^\d{1,20}$/.test(req.params.id)) return res.status(400).json({ error: "bad id" });
  res.setHeader("Cache-Control", "no-store");
  res.json({ events: await readEvents(req.params.id) });
});
