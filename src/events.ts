import { connection } from "./queue";

/** One line of the live timeline the portfolio page shows for an order. */
export interface SyncEvent {
  t: number; // epoch ms
  step: string;
  status: "ok" | "info" | "retry" | "error" | "done";
  detail?: string;
}

const TTL_SECONDS = 60 * 60 * 6;
const key = (orderId: string | number) => `demo:events:${orderId}`;

export async function recordEvent(orderId: string | number, e: Omit<SyncEvent, "t">): Promise<void> {
  try {
    await connection
      .multi()
      .rpush(key(orderId), JSON.stringify({ t: Date.now(), ...e }))
      .expire(key(orderId), TTL_SECONDS)
      .exec();
  } catch (err) {
    // The timeline is observability only; never let it break the sync itself.
    console.warn(`timeline write failed for ${orderId}:`, (err as Error).message);
  }
}

export async function readEvents(orderId: string | number): Promise<SyncEvent[]> {
  const raw = await connection.lrange(key(orderId), 0, -1);
  return raw.map((r) => JSON.parse(r) as SyncEvent);
}

export async function bumpStat(name: "synced" | "retries" | "failed"): Promise<void> {
  try {
    await connection.hincrby("demo:stats", name, 1);
  } catch {
    /* ignore */
  }
}

export async function readStats(): Promise<Record<string, number>> {
  const h = await connection.hgetall("demo:stats");
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v)]));
}
