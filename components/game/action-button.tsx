import Link from "next/link";
import type { ReactNode } from "react";

/** A POST form button that works without JS. Spectators get a sign-in link instead. */
export function ActionButton({
  action,
  fields = {},
  label,
  variant = "primary",
  canAct,
  back,
  className,
  style,
}: {
  action: string;
  fields?: Record<string, string>;
  label: ReactNode;
  variant?: "primary" | "ghost" | "danger";
  canAct: boolean;
  back?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cls = `btn${variant === "ghost" ? " ghost" : variant === "danger" ? " red" : ""}${className ? ` ${className}` : ""}`;
  if (!canAct) {
    return (
      <Link className={cls} href={`/signin${back ? `?next=${encodeURIComponent(back)}` : ""}`} style={style}>
        {label}
      </Link>
    );
  }
  return (
    <form method="post" action={action} style={{ display: "inline-flex" }}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {back ? <input type="hidden" name="back" value={back} /> : null}
      <button type="submit" className={cls} style={style}>
        {label}
      </button>
    </form>
  );
}
