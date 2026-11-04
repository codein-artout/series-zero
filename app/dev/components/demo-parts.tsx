"use client";
import { useState } from "react";
import { NumberTick } from "@/components/ui/number-tick";
import { scripFull } from "@/lib/format";
export { Button } from "@/components/ui/primitives";

export function NumberTickDemo() {
  const [v, setV] = useState(12480);
  return (
    <div className="row" style={{ gap: 12 }}>
      <NumberTick value={v} format={scripFull} className="br" style={{ fontSize: 26, fontWeight: 600 }} />
      <button type="button" className="btn ghost sm" onClick={() => setV((x) => x + 1150)}>
        Roll the number
      </button>
    </div>
  );
}
