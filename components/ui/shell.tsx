import Link from "next/link";
import type { ReactNode } from "react";
import { cx, LogoMark } from "./primitives";

export interface TapeItem {
  name: string;
  value?: string;
  delta?: { text: string; dir: "up" | "dn" | "flat" };
  urgent?: boolean;
}

/** 36px ticker tape. Marquee loops in 60s, pauses on hover, static under reduced motion. */
export function TickerTape({ items, marquee = true }: { items: TapeItem[]; marquee?: boolean }) {
  const cells = (hidden: boolean) =>
    items.map((it, i) => (
      <span className="tape-cell" key={`${hidden ? "b" : "a"}${i}`} aria-hidden={hidden || undefined}>
        <b className={it.urgent ? "dn" : undefined}>{it.name}</b>
        {it.value ? <span>{it.value}</span> : null}
        {it.delta ? <em className={it.delta.dir === "up" ? "up" : it.delta.dir === "dn" ? "dn" : "mut"}>{it.delta.text}</em> : null}
      </span>
    ));
  return (
    <div className={cx("tape", marquee && "marquee")} role="region" aria-label="Live ticker">
      <div className="tape-track">
        {cells(false)}
        {marquee ? cells(true) : null}
      </div>
    </div>
  );
}

export type NavKey = "floor" | "pitch" | "founder" | "fund" | "wire" | "demo" | "cards" | "create" | "admin" | "dev" | "none";

export interface NavLinks {
  pitch: string;
  founder: string;
  fund: string;
  cards: string;
}

const DEFAULT_LINKS: NavLinks = { pitch: "/pitch/latest", founder: "/company/mine", fund: "/fund/mine", cards: "/cards" };

export function SideNav({
  active,
  wireCount,
  balance,
  burnToday,
  links = DEFAULT_LINKS,
}: {
  active: NavKey;
  wireCount?: number;
  balance?: string;
  burnToday?: string;
  links?: NavLinks;
}) {
  const items: Array<{ key: NavKey; label: string; href: string; badge?: number }> = [
    { key: "floor", label: "The Floor", href: "/floor" },
    { key: "pitch", label: "Pitch Room", href: links.pitch },
    { key: "founder", label: "My Founder", href: links.founder },
    { key: "fund", label: "My Fund", href: links.fund },
    { key: "wire", label: "The Wire", href: "/wire", badge: wireCount },
    { key: "demo", label: "Demo Day", href: "/demo-day" },
    { key: "cards", label: "Cards", href: links.cards },
  ];
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" style={{ marginBottom: 22 }}>
        <LogoMark />
      </Link>
      {items.map((it) => (
        <Link key={it.key} href={it.href} className={cx("nav-link", active === it.key && "on")} aria-current={active === it.key ? "page" : undefined}>
          {it.label}
          {it.badge ? (
            <span className="chip br sm" aria-label={`${it.badge} new`}>
              {it.badge}
            </span>
          ) : null}
        </Link>
      ))}
      <div style={{ flex: 1 }} />
      {balance ? (
        <div className="card" style={{ padding: 14 }}>
          <div className="lbl">Balance</div>
          <div className="num br" style={{ fontSize: 26, fontWeight: 600 }}>
            {balance}
          </div>
          {burnToday ? (
            <div className="legal" style={{ marginTop: 6 }}>
              {burnToday}
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="legal" style={{ padding: "10px 4px 0" }}>
        Simulation. Fictional founders and funds. Not investment advice.
      </p>
    </nav>
  );
}

export function TabBar({ active, links = DEFAULT_LINKS }: { active: NavKey; links?: NavLinks }) {
  const items: Array<{ key: NavKey; label: string; href: string }> = [
    { key: "floor", label: "Floor", href: "/floor" },
    { key: "pitch", label: "Pitch", href: links.pitch },
    { key: "founder", label: "Founder", href: links.founder },
    { key: "wire", label: "Wire", href: "/wire" },
    { key: "demo", label: "Demo", href: "/demo-day" },
  ];
  return (
    <nav className="tabbar" aria-label="Tabs">
      {items.map((it) => (
        <Link key={it.key} href={it.href} className={cx(active === it.key && "on")} aria-current={active === it.key ? "page" : undefined}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({
  tape,
  active,
  wireCount,
  balance,
  burnToday,
  links,
  children,
}: {
  tape: TapeItem[];
  active: NavKey;
  wireCount?: number;
  balance?: string;
  burnToday?: string;
  links?: NavLinks;
  children: ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TickerTape items={tape} />
      <div className="shell">
        <SideNav active={active} wireCount={wireCount} balance={balance} burnToday={burnToday} links={links} />
        <main id="main" className="main">
          <div className="main-inner">
            {children}
            <p className="legal only-phone">Simulation. Fictional founders and funds. Not investment advice.</p>
          </div>
        </main>
      </div>
      <TabBar active={active} links={links} />
    </>
  );
}
