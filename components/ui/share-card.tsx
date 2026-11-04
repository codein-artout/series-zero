import { Chip, LogoMark, Stamp } from "./primitives";

export type ShareCardData =
  | {
      kind: "term_sheet";
      season: number;
      investor: string;
      company: string;
      preMoney: string;
      check: string;
      ownership: string;
      liqPref: string;
      board: string;
      signature: string;
    }
  | { kind: "roast"; vc: string; interest: string; quote: string; company: string; stage: string; ask: string }
  | { kind: "exit"; tick: number; price: string; company: string; acquirer: string; label: string; lead: string; multiple: string };

const FOOT = "Fictional. Not investment advice.";

/** DOM preview of a share card at 430x538 (the image route renders the same layout at 1080x1350). */
export function ShareCard({ data }: { data: ShareCardData }) {
  const box: React.CSSProperties = { width: 430, maxWidth: "100%", height: 538, padding: "30px 30px 24px", display: "flex", flexDirection: "column", borderRadius: 2 };
  if (data.kind === "term_sheet") {
    return (
      <div className="paper" style={box} aria-label={`Term sheet card: ${data.investor} invests in ${data.company}`} role="img">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="lbl">Term sheet · Season {data.season}</div>
          <Stamp variant="brass" style={{ fontSize: 13, padding: "3px 10px" }}>
            Funded
          </Stamp>
        </div>
        <div className="h1" style={{ fontSize: 40, marginTop: 18, color: "var(--ink)" }}>
          {data.investor}
          <br />
          <span className="it">invests in {data.company}</span>
        </div>
        <hr className="hair" style={{ margin: "20px 0 6px" }} />
        <table className="tbl num" style={{ fontSize: 14 }}>
          <tbody>
            {[
              ["Pre-money", data.preMoney],
              ["Check", data.check],
              ["Ownership", data.ownership],
              ["Liquidation pref", data.liqPref],
              ["Board", data.board],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="mut">{k}</td>
                <td className="r">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ flex: 1 }} />
        <div className="sig" style={{ fontSize: 26, width: 200 }}>
          {data.signature}
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <LogoMark size={16} onPaper />
          <span className="legal">{FOOT}</span>
        </div>
      </div>
    );
  }
  if (data.kind === "roast") {
    return (
      <div style={{ ...box, background: "var(--sys-bg)", border: "1px solid var(--sys-line)" }} role="img" aria-label={`Rejection card: ${data.vc} passed on ${data.company}`}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="lbl" style={{ color: "var(--red)" }}>
            Passed · {data.vc}
          </div>
          <Chip variant="down">Interest {data.interest}</Chip>
        </div>
        <div style={{ marginTop: 26, fontFamily: "var(--disp)", fontWeight: 700, fontSize: 38, lineHeight: 1.08, letterSpacing: "-.01em" }}>&ldquo;{data.quote}&rdquo;</div>
        <div className="mut" style={{ marginTop: 14, fontSize: 14 }}>
          Pitched: <b style={{ color: "var(--tx)" }}>{data.company}</b> · {data.stage} · asking {data.ask}
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Stamp style={{ fontSize: 34, padding: "10px 26px", transform: "rotate(-8deg)" }}>Passed</Stamp>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <LogoMark size={16} />
          <span className="legal">{FOOT}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="spot" style={{ ...box, backgroundColor: "var(--s1)", border: "1px solid var(--brass)" }} role="img" aria-label={`Exit card: ${data.company} ${data.label.toLowerCase()} for ${data.price}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="lbl" style={{ color: "var(--brass2)" }}>
          Exit · Tick {data.tick}
        </div>
        <Chip variant="brass">{data.label}</Chip>
      </div>
      <div className="num br" style={{ fontSize: 92, fontWeight: 600, lineHeight: 1, marginTop: 34, letterSpacing: "-.03em" }}>
        {data.price}
      </div>
      <div className="h2" style={{ marginTop: 14, fontSize: 32 }}>
        {data.company}
        <br />
        <span className="it">{data.acquirer}</span>
      </div>
      <hr className="hair" style={{ margin: "20px 0 14px" }} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="mut">Lead investor</span>
        <b>{data.lead}</b>
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <span className="mut">Return on the check</span>
        <b className="num up">{data.multiple}</b>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <span
          style={{ display: "inline-flex", width: 96, height: 96, border: "3px double var(--brass)", borderRadius: "50%", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: ".2em", color: "var(--brass2)", transform: "rotate(-10deg)" }}
        >
          EXIT
        </span>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <LogoMark size={16} />
        <span className="legal">{FOOT}</span>
      </div>
    </div>
  );
}
