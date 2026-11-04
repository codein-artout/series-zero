/* Satori layout for share card images (1080x1350 post, 1200x630 link). Flex only. */
import fs from "node:fs";
import path from "node:path";
import type { ShareCardData } from "@/components/ui/share-card";

const F = (pkg: string, file: string) => fs.readFileSync(path.join(process.cwd(), "node_modules/@fontsource", pkg, "files", file));

let fonts: Array<{ name: string; data: Buffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" | "italic" }> | null = null;
export function cardFonts() {
  fonts ??= [
    { name: "Bodoni", data: F("bodoni-moda", "bodoni-moda-latin-700-normal.woff"), weight: 700, style: "normal" },
    { name: "Bodoni", data: F("bodoni-moda", "bodoni-moda-latin-800-normal.woff"), weight: 800, style: "normal" },
    { name: "Bodoni", data: F("bodoni-moda", "bodoni-moda-latin-500-italic.woff"), weight: 500, style: "italic" },
    { name: "Mono", data: F("ibm-plex-mono", "ibm-plex-mono-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Mono", data: F("ibm-plex-mono", "ibm-plex-mono-latin-600-normal.woff"), weight: 600, style: "normal" },
    { name: "Mono", data: F("ibm-plex-mono", "ibm-plex-mono-latin-700-normal.woff"), weight: 700, style: "normal" },
    { name: "Sans", data: F("ibm-plex-sans", "ibm-plex-sans-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Sans", data: F("ibm-plex-sans", "ibm-plex-sans-latin-600-normal.woff"), weight: 600, style: "normal" },
  ];
  return fonts;
}

const C = { paper: "#EDEBE1", ink: "#1A1F1C", ink2: "#4C5650", stamp: "#B3321D", pen: "#2B4C9B", brassink: "#7A5C12", bg: "#14241F", tx: "#E8EDE6", mut: "#9DB2A7", red: "#FF6A52", brass: "#C8A24A", brass2: "#E4C677", up: "#6FE0A0", sysbg: "#1A1210", sysline: "#5A2A22", dn: "#FF8A78" };
const LEGAL = "Simulation. Fictional founders and funds. Not investment advice.";

function Logo({ color, ring }: { color: string; ring: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", width: 44, height: 44, borderRadius: 22, border: `3px solid ${ring}`, alignItems: "center", justifyContent: "center", fontFamily: "Mono", fontSize: 22, color: ring, fontWeight: 600 }}>0</div>
      <div style={{ fontFamily: "Bodoni", fontWeight: 800, fontSize: 36, color }}>Series Zero</div>
    </div>
  );
}

function Stamp({ text, color, size = 30, rotate = -6 }: { text: string; color: string; size?: number; rotate?: number }) {
  return (
    <div style={{ display: "flex", border: `3px solid ${color}`, padding: 4, transform: `rotate(${rotate}deg)`, borderRadius: 6 }}>
      <div style={{ display: "flex", border: `2px solid ${color}`, color, fontFamily: "Mono", fontWeight: 700, letterSpacing: size * 0.2, fontSize: size, padding: `${size * 0.25}px ${size * 0.7}px`, borderRadius: 3 }}>{text.toUpperCase()}</div>
    </div>
  );
}

/** Renders at 1080x1350; `link` (1200x630) uses a horizontal variant. */
export function CardImage({ d, size }: { d: ShareCardData; size: "post" | "link" }) {
  const post = size === "post";
  const pad = post ? 72 : 56;
  const s = post ? 1 : 0.62;
  if (d.kind === "term_sheet") {
    return (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.paper, color: C.ink, padding: pad, fontFamily: "Sans" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "Mono", fontSize: 26 * s + 6, letterSpacing: 4, color: C.ink2 }}>{`TERM SHEET · SEASON ${d.season}`}</div>
          <Stamp text="Funded" color={C.brassink} size={30 * s + 6} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40 * s, fontFamily: "Bodoni", fontWeight: 800, fontSize: 96 * s, lineHeight: 1.02 }}>
          <div>{d.investor}</div>
          <div style={{ fontStyle: "italic", fontWeight: 500 }}>{`invests in ${d.company}`}</div>
        </div>
        <div style={{ display: "flex", height: 2, background: "#1A1F1C30", margin: `${44 * s}px 0 ${10 * s}px` }} />
        {[["Pre-money", d.preMoney], ["Check", d.check], ["Ownership", d.ownership], ["Liquidation pref", d.liqPref], ["Board", d.board]].slice(0, post ? 5 : 3).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontFamily: "Mono", fontSize: 34 * s + 4, padding: `${16 * s}px 0`, borderBottom: "2px solid #1A1F1C22" }}>
            <div style={{ color: C.ink2 }}>{k}</div>
            <div>{v}</div>
          </div>
        ))}
        <div style={{ display: "flex", flex: 1 }} />
        {post ? <div style={{ display: "flex", fontFamily: "Bodoni", fontStyle: "italic", fontWeight: 500, fontSize: 60 * s, color: C.pen, borderBottom: `3px solid ${C.ink}`, width: 460 * s, paddingBottom: 4 }}>{d.signature}</div> : null}
        <div style={{ display: "flex", flexDirection: post ? "column" : "row", justifyContent: "space-between", alignItems: post ? "flex-start" : "center", gap: 10, marginTop: 28 * s }}>
          <Logo color={C.ink} ring={C.brassink} />
          <div style={{ fontFamily: "Mono", fontSize: 20, color: C.ink2 }}>{LEGAL}</div>
        </div>
      </div>
    );
  }
  if (d.kind === "roast") {
    return (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.sysbg, border: `3px solid ${C.sysline}`, color: C.tx, padding: pad, fontFamily: "Sans" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "Mono", fontSize: 26 * s + 6, letterSpacing: 4, color: C.red }}>{`PASSED · ${d.vc.toUpperCase()}`}</div>
          <div style={{ display: "flex", border: "2px solid #8A4338", color: C.dn, borderRadius: 99, padding: "6px 22px", fontFamily: "Mono", fontSize: 24 * s + 4 }}>{`INTEREST ${d.interest}`}</div>
        </div>
        <div style={{ display: "flex", marginTop: 60 * s, fontFamily: "Bodoni", fontWeight: 700, fontSize: 90 * s, lineHeight: 1.08 }}>{`“${d.quote}”`}</div>
        <div style={{ display: "flex", marginTop: 32 * s, fontSize: 32 * s + 4, color: C.mut }}>
          {`Pitched: ${d.company} · ${d.stage} · asking ${d.ask}`}
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Stamp text="Passed" color={C.red} size={80 * s} rotate={-8} />
        </div>
        <div style={{ display: "flex", flexDirection: post ? "column" : "row", justifyContent: "space-between", alignItems: post ? "flex-start" : "center", gap: 10, marginTop: 0 }}>
          <Logo color={C.tx} ring={C.brass} />
          <div style={{ fontFamily: "Mono", fontSize: 20, color: C.mut }}>{LEGAL}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", backgroundColor: C.bg, backgroundImage: "radial-gradient(ellipse at 50% 0%, #C8A24A33 0%, #C8A24A00 62%)", border: `3px solid ${C.brass}`, color: C.tx, padding: pad, fontFamily: "Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "Mono", fontSize: 26 * s + 6, letterSpacing: 4, color: C.brass2 }}>{`EXIT · TICK ${d.tick}`}</div>
        <div style={{ display: "flex", border: `2px solid ${C.brass}`, color: C.brass2, borderRadius: 99, padding: "6px 22px", fontFamily: "Mono", fontSize: 24 * s + 4 }}>{d.label.toUpperCase()}</div>
      </div>
      <div style={{ display: "flex", fontFamily: "Mono", fontWeight: 600, fontSize: 220 * s, color: C.brass, marginTop: 60 * s, letterSpacing: -6 }}>{d.price}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 20 * s, fontFamily: "Bodoni", fontWeight: 700, fontSize: 76 * s, lineHeight: 1.08 }}>
        <div>{d.company}</div>
        <div style={{ fontStyle: "italic", fontWeight: 500 }}>{d.acquirer}</div>
      </div>
      <div style={{ display: "flex", height: 2, background: "#2C4A3F", margin: `${40 * s}px 0 ${24 * s}px` }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 34 * s + 4 }}>
        <div style={{ color: C.mut }}>Lead investor</div>
        <div style={{ fontWeight: 600 }}>{d.lead}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 34 * s + 4, marginTop: 16 * s }}>
        <div style={{ color: C.mut }}>Return on the check</div>
        <div style={{ fontFamily: "Mono", fontWeight: 600, color: C.up }}>{d.multiple}</div>
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
        <div style={{ display: "flex", width: 220 * s, height: 220 * s, border: `3px solid ${C.brass}`, borderRadius: 999, alignItems: "center", justifyContent: "center", transform: "rotate(-10deg)", padding: 6 }}>
          <div style={{ display: "flex", width: "100%", height: "100%", border: `2px solid ${C.brass}`, borderRadius: 999, alignItems: "center", justifyContent: "center", fontFamily: "Mono", fontWeight: 700, letterSpacing: 10, fontSize: 48 * s, color: C.brass2 }}>EXIT</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: post ? "column" : "row", justifyContent: "space-between", alignItems: post ? "flex-start" : "center", gap: 10, marginTop: 0 }}>
          <Logo color={C.tx} ring={C.brass} />
          <div style={{ fontFamily: "Mono", fontSize: 20, color: C.mut }}>{LEGAL}</div>
        </div>
    </div>
  );
}
