"use client";
import { useState } from "react";

/** DNA textarea with a live character count. The server is authoritative on save. */
export function DnaEditor({ initial, max, disabled }: { initial: string; max: number; disabled?: boolean }) {
  const [text, setText] = useState(initial);
  const over = text.length > max;
  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: -6 }}>
        <span className={`chip ${over ? "dn" : ""}`} aria-live="polite">
          {text.length.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
        </span>
      </div>
      <label className="sr-only" htmlFor="dna">
        DNA text
      </label>
      <textarea id="dna" name="dna" className="field mono-field" rows={13} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} aria-invalid={over || undefined} aria-describedby={over ? "dna-err" : undefined} />
      {over ? (
        <span id="dna-err" className="field-error" role="alert">
          Your DNA is {text.length.toLocaleString("en-US")} characters. The limit is {max.toLocaleString("en-US")}.
        </span>
      ) : null}
    </>
  );
}
