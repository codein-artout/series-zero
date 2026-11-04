"use client";
import { useEffect, useState } from "react";

import { fmtCountdown as fmt } from "@/lib/format";


/** Counts down to the next scheduled tick. Server renders the initial value. */
export function Countdown({ target, initial, className, style }: { target: number; initial: string; className?: string; style?: React.CSSProperties }) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setText(fmt(target - Date.now())), 1000);
    return () => clearInterval(id);
  }, [target]);
  return (
    <span className={className} style={style} suppressHydrationWarning>
      {text}
    </span>
  );
}

