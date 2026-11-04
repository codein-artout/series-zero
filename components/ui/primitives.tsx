import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { direction, glyph, type Direction } from "@/lib/format";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}
export { cx };

export const LEGAL = "Simulation. Fictional founders and funds. Not investment advice.";

export function LegalLine({ className, children }: { className?: string; children?: ReactNode }) {
  return <p className={cx("legal", className)}>{children ?? LEGAL}</p>;
}

export function Label({ children, className, as: As = "div", ...rest }: { children: ReactNode; className?: string; as?: "div" | "span" | "h2" | "h3" } & Record<string, unknown>) {
  return (
    <As className={cx("lbl", className)} {...rest}>
      {children}
    </As>
  );
}

type CardVariant = "default" | "flat" | "accent" | "system";
export function Card({
  variant = "default",
  className,
  children,
  as: As = "div",
  ...rest
}: { variant?: CardVariant; className?: string; children?: ReactNode; as?: "div" | "section" | "article" | "aside" } & Omit<ComponentProps<"div">, "ref">) {
  return (
    <As
      className={cx("card", variant === "flat" && "flat", variant === "accent" && "accent", variant === "system" && "sys", className)}
      {...rest}
    >
      {children}
    </As>
  );
}

type BtnVariant = "primary" | "ghost" | "danger";
const btnClass = (v: BtnVariant, extra?: string) => cx("btn", v === "ghost" && "ghost", v === "danger" && "red", extra);

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...rest
}: { variant?: BtnVariant; loading?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={btnClass(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {children}
      {loading ? <span aria-hidden="true">…</span> : null}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  href,
  children,
  disabled,
  ...rest
}: { variant?: BtnVariant; href: string; disabled?: boolean } & Omit<ComponentProps<typeof Link>, "href">) {
  if (disabled) {
    return (
      <a className={btnClass(variant, className)} aria-disabled="true" role="link">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={btnClass(variant, className)} {...rest}>
      {children}
    </Link>
  );
}

export type ChipVariant = "neutral" | "brass" | "up" | "down";
export function Chip({ variant = "neutral", small, className, children, ...rest }: { variant?: ChipVariant; small?: boolean } & ComponentProps<"span">) {
  return (
    <span
      className={cx("chip", variant === "brass" && "br", variant === "up" && "up", variant === "down" && "dn", small && "sm", className)}
      {...rest}
    >
      {children}
    </span>
  );
}

export type StampVariant = "red" | "brass";
export function Stamp({
  variant = "red",
  slam,
  className,
  style,
  children,
}: { variant?: StampVariant; slam?: boolean; className?: string; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <span className={cx("stamp", variant === "brass" && "ok", slam && "slam", className)} style={style}>
      {children}
    </span>
  );
}

export function Bar({ value, dead, label, className, style }: { value: number; dead?: boolean; label?: string; className?: string; style?: React.CSSProperties }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={cx("bar", dead && "dead", className)}
      style={style}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label ?? "Bar"}
    >
      <i style={{ width: `${(v * 100).toFixed(1)}%` }} />
    </div>
  );
}

export function Hair({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <hr className={cx("hair", className)} style={style} />;
}

export function Mark({ text, size = 40, system, className }: { text: string; size?: number; system?: boolean; className?: string }) {
  return (
    <span
      className={cx("mk", system && "sys", className)}
      aria-hidden="true"
      style={size !== 40 ? { width: size, height: size, fontSize: Math.round(size * 0.4) } : undefined}
    >
      {text}
    </span>
  );
}

export function LogoMark({ size = 24, onPaper }: { size?: number; onPaper?: boolean }) {
  const ring = Math.round(size * 1.08);
  return (
    <span className="logo" style={{ fontSize: size, color: onPaper ? "var(--ink)" : undefined }}>
      <i
        aria-hidden="true"
        style={
          size !== 24 || onPaper
            ? {
                width: ring,
                height: ring,
                fontSize: Math.round(ring / 2),
                borderColor: onPaper ? "var(--brassink)" : undefined,
                color: onPaper ? "var(--brassink)" : undefined,
              }
            : undefined
        }
      >
        0
      </i>
      Series Zero
    </span>
  );
}

/** Glyph + signed number. Never colour alone. */
export function Delta({ value, format, className, flatBand = 0.005 }: { value: number; format: (abs: number) => string; className?: string; flatBand?: number }) {
  const d: Direction = direction(value, flatBand);
  const cls = d === "up" ? "up" : d === "dn" ? "dn" : "mut";
  const sign = value < 0 && d === "flat" && Math.abs(value) > 0 ? "−" : "";
  return (
    <span className={cx("num", cls, className)}>
      {glyph(d)} {sign}
      {format(Math.abs(value))}
    </span>
  );
}

export function StatTile({ label, value, delta, valueClass, className }: { label: string; value: ReactNode; delta?: ReactNode; valueClass?: string; className?: string }) {
  return (
    <div className={cx("card", className)} style={{ padding: "14px 16px" }}>
      <div className="lbl">{label}</div>
      <div className={cx("num", valueClass)} style={{ fontSize: 26, fontWeight: 600 }}>
        {value}
      </div>
      {delta != null ? (
        <div className="num" style={{ fontSize: 12 }}>
          {delta}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({ line, action }: { line: string; action?: { href: string; label: string } }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", padding: "12px 0" }}>
      <p className="mut">{line}</p>
      {action ? (
        <ButtonLink href={action.href} className="sm">
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}

export function PageHeader({
  label,
  title,
  italic,
  right,
  size = 52,
  mark,
}: {
  label: ReactNode;
  title: ReactNode;
  italic?: ReactNode;
  right?: ReactNode;
  size?: number;
  mark?: ReactNode;
}) {
  return (
    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
      <div className="row" style={{ gap: 18 }}>
        {mark}
        <div>
          <div className="lbl">{label}</div>
          <h1 className="h1 page-title" style={{ fontSize: size, marginTop: 6 }}>
            {title}
            {italic ? (
              <>
                {" "}
                <span className="it">{italic}</span>
              </>
            ) : null}
          </h1>
        </div>
      </div>
      {right ? (
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {right}
        </div>
      ) : null}
    </div>
  );
}
