import type { ComponentProps, ReactNode } from "react";
import { cx } from "./primitives";

export function TextField({
  id,
  label,
  error,
  hint,
  mono,
  hideLabel,
  ...rest
}: { id: string; label: string; error?: string; hint?: ReactNode; mono?: boolean; hideLabel?: boolean } & ComponentProps<"input">) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className={cx("lbl", hideLabel && "sr-only")} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={cx("field", mono && "mono-field")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        {...rest}
      />
      {hint ? <span className="legal">{hint}</span> : null}
      {error ? (
        <span id={`${id}-err`} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextArea({
  id,
  label,
  error,
  hint,
  mono,
  hideLabel,
  ...rest
}: { id: string; label: string; error?: string; hint?: ReactNode; mono?: boolean; hideLabel?: boolean } & ComponentProps<"textarea">) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className={cx("lbl", hideLabel && "sr-only")} htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className={cx("field", mono && "mono-field")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        {...rest}
      />
      {hint ? <span className="legal">{hint}</span> : null}
      {error ? (
        <span id={`${id}-err`} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
