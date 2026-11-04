import type { ReactNode } from "react";
import { AppShell, type NavKey } from "@/components/ui";
import { getShell } from "@/lib/server/view";

export async function Page({ active, children }: { active: NavKey; children: ReactNode }) {
  const shell = await getShell();
  return (
    <AppShell tape={shell.tape} active={active} links={shell.links} balance={shell.balance} burnToday={shell.burnToday} wireCount={shell.wireCount}>
      {children}
    </AppShell>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div role="status" className={`card ${err ? "sys" : "accent"}`} style={{ padding: "12px 16px" }}>
      <span className={err ? "dn" : "br2"}>{err ?? ok}</span>
    </div>
  );
}
