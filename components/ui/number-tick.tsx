"use client";
import { useEffect, useRef, useState } from "react";

/** Rolls a number from its previous value to the new one over 300ms. Instant under reduced motion. */
export function NumberTick({ value, format, className, style }: { value: number; format: (n: number) => string; className?: string; style?: React.CSSProperties }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 300);
      setShown(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className={`num ${className ?? ""}`} style={style} aria-live="polite">
      {format(shown)}
    </span>
  );
}
