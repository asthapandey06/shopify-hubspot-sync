import { Worker, Job, UnrecoverableError } from "bullmq";
import { connection, QUEUE_NAME } from "./queue";
import { syncOrderToHubSpot } from "./hubspot";
import { recordEvent, bumpStat } from "./events";
import type { ShopifyOrder } from "./shopify";

async function processJob(job: Job<ShopifyOrder>) {
  const order = job.data;
  const attempt = job.attemptsMade + 1;
  console.log(`[${job.id}] syncing order ${order.name} (attempt ${attempt})`);
  await recordEvent(order.id, { step: `Worker picked up job (attempt ${attempt})`, status: "info" });

  // Demo only: the visitor can ask for a simulated HubSpot outage on the first attempt,
  // so they can watch the real retry/backoff path run. The flag is set per order.
  if (attempt === 1 && (await connection.get(`demo:chaos:${order.id}`))) {
    throw new Error("HubSpot 429 (retryable): injected outage for the demo");
  }

  const result = await syncOrderToHubSpot(order, (step, detail) =>
    recordEvent(order.id, { step, detail, status: "ok" })
  );
  return result;
}

export function startWorker() {
  const worker = new Worker<ShopifyOrder>(QUEUE_NAME, processJob, { connection, concurrency: 5 });

  worker.on("completed", async (job) => {
    console.log(`[${job.id}] done`);
    await bumpStat("synced");
    await recordEvent(job.data.id, { step: "Sync complete", status: "done" });
  });
  worker.on("failed", async (job, err) => {
    if (!job) return;
    console.error(`[${job.id}] failed (attempt ${job.attemptsMade}): ${err.message}`);
    const willRetry = job.attemptsMade < (job.opts.attempts ?? 1) && !(err instanceof UnrecoverableError);
    if (willRetry) {
      await bumpStat("retries");
      const delay = 2000 * 2 ** (job.attemptsMade - 1);
      await recordEvent(job.data.id, {
        step: `Attempt ${job.attemptsMade} failed, retrying in ${delay / 1000}s`,
        detail: err.message,
        status: "retry",
      });
    } else {
      await bumpStat("failed");
      await recordEvent(job.data.id, { step: "Sync failed permanently", detail: err.message, status: "error" });
    }
  });

  console.log("Worker started");
  return worker;
}

if (require.main === module) startWorker();
