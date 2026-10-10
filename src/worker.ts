import { Worker } from "bullmq";
import { connection, QUEUE_NAME } from "./queue";
import { syncOrderToHubSpot } from "./hubspot";
import type { ShopifyOrder } from "./shopify";

const worker = new Worker<ShopifyOrder>(
  QUEUE_NAME,
  async (job) => {
    console.log(`[${job.id}] syncing order ${job.data.name} (attempt ${job.attemptsMade + 1})`);
    await syncOrderToHubSpot(job.data);
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => console.log(`[${job.id}] done`));
worker.on("failed", (job, err) =>
  console.error(`[${job?.id}] failed (attempt ${job?.attemptsMade}): ${err.message}`)
);

console.log("Worker started");
