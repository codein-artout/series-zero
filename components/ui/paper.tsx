import type { ReactNode } from "react";
import { cx } from "./primitives";

export function Paper({ className, children, arrive, style, as: As = "div", ...rest }: { className?: string; children: ReactNode; arrive?: boolean; style?: React.CSSProperties; as?: "div" | "article" | "section" } & Record<string, unknown>) {
  return (
    <As className={cx("paper", arrive && "arrive", className)} style={style} {...rest}>
      {children}
    </As>
  );
}

export interface TermRow {
  no: string;
  term: string;
  offered: string;
  counter?: ReactNode;
}

export function TermTable({ rows, showCounter = true }: { rows: TermRow[]; showCounter?: boolean }) {
  return (
    <table className="tbl" style={{ fontSize: 15 }}>
      <thead>
        <tr>
          <th style={{ width: 42 }} scope="col">
            <span aria-hidden="true">§</span>
            <span className="sr-only">Clause</span>
          </th>
          <th scope="col">Term</th>
          <th className="r" scope="col">Offered</th>
          {showCounter ? (
            <th className="r" style={{ width: 150 }} scope="col">
              Your counter
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.no}>
            <td className="num mut">{r.no}</td>
            <td>{r.term}</td>
            <td className="r num">{r.offered}</td>
            {showCounter ? <td className="r num mut">{r.counter ?? "keep"}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MarginNote({ text, by }: { text: string; by: string }) {
  return (
    <div className="margin-note">
      &ldquo;{text}&rdquo;{" "}
      <span style={{ fontFamily: "var(--mono)", fontStyle: "normal", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>· {by}</span>
    </div>
  );
}

export function SignatureLine({ signature, label, size = 28 }: { signature?: string; label: string; size?: number }) {
  return (
    <div style={{ flex: "1 1 220px" }}>
      {signature ? (
        <div className="sig" style={{ fontSize: size }}>
          {signature}
        </div>
      ) : (
        <div style={{ height: 40, borderBottom: "1.5px solid var(--ink)" }} />
      )}
      <div className="lbl" style={{ marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

export interface CapRow {
  holder: string;
  now: number | null;
  after: number;
  investor?: boolean;
}

export function CapTable({ rows, caption }: { rows: CapRow[]; caption?: string }) {
  const f = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    <table className="tbl num" style={{ marginTop: 6, fontSize: 13 }}>
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      <thead>
        <tr>
          <th scope="col">Holder</th>
          <th className="r" scope="col">Now</th>
          <th className="r" scope="col">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.holder}>
            <td className={r.investor ? "br" : undefined}>{r.holder}</td>
            <td className={cx("r", r.now == null && "mut")}>{r.now == null ? "—" : f(r.now)}</td>
            <td className={cx("r", r.investor && "br")}>{f(r.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
