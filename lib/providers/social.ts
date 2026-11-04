/**
 * SocialProvider: v1 ships only LogOnlySocialProvider. Approved drafts are written to the
 * SocialLog table. Nothing is ever posted to an outside platform; there is no network code here.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";

export interface SocialDraft {
  id: string;
  agentId: string;
  text: string;
}

export interface SocialProvider {
  readonly name: string;
  readonly postsExternally: false;
  publish(d: SocialDraft): Promise<{ logged: true; id: string }>;
}

export class LogOnlySocialProvider implements SocialProvider {
  readonly name = "log-only";
  readonly postsExternally = false as const;
  async publish(d: SocialDraft): Promise<{ logged: true; id: string }> {
    const db = await prisma();
    const id = randomUUID();
    await db.socialLog.create({ data: { id, draftId: d.id, agentId: d.agentId, text: d.text } });
    return { logged: true, id };
  }
}

export function getSocialProvider(): SocialProvider {
  return new LogOnlySocialProvider();
}
