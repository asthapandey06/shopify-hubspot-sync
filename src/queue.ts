import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config";
import type { ShopifyOrder } from "./shopify";

export const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUE_NAME = "order-sync";

export const orderQueue = new Queue<ShopifyOrder>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 }, // 2s, 4s, 8s, 16s...
    removeOnComplete: 1000,
    removeOnFail: 5000, // keep failed jobs for inspection
  },
});
