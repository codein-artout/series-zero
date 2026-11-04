/**
 * PushProvider: log only in v1. Respects quiet hours (23:00-08:00 in the game time zone) by
 * skipping the push; the in-app inbox still has every notification.
 */
import { randomUUID } from "node:crypto";
import { loadGameConfig } from "@/config/load";
import type { Notification } from "@/lib/sim/types";
import { prisma } from "@/lib/db/client";

export interface PushProvider {
  readonly name: string;
  send(userId: string, text: string): Promise<void>;
}

export class LogPushProvider implements PushProvider {
  readonly name = "log";
  async send(userId: string, text: string): Promise<void> {
    const db = await prisma();
    await db.pushLog.create({ data: { id: randomUUID(), userId, text } });
  }
}

let provider: PushProvider = new LogPushProvider();
export function setPushProvider(p: PushProvider): void {
  provider = p;
}

export function inQuietHours(now: Date, tz: string, start: string, end: string): boolean {
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const m = toMin(hm);
  const a = toMin(start);
  const b = toMin(end);
  return a > b ? m >= a || m < b : m >= a && m < b;
}

export async function deliverPushes(list: Notification[], now = new Date()): Promise<number> {
  const cfg = loadGameConfig();
  if (inQuietHours(now, cfg.ticks.timezone, cfg.notifications.quietStart, cfg.notifications.quietEnd)) return 0;
  let n = 0;
  for (const x of list) {
    try {
      await provider.send(x.userId, x.text);
      n++;
    } catch {
      // Push is best effort.
    }
  }
  return n;
}
