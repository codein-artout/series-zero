/**
 * Unwraps a design-canvas `.dc.html` mockup into standalone HTML.
 * - moves <helmet> contents into <head> (Google Fonts links are dropped; fonts are self-hosted)
 * - keeps the body of <x-dc>
 * - drops <script> blocks, resolves <sc-if> and {{holes}} from renderVals()
 */
export type DcVals = Record<string, unknown>;

export function extractScript(src: string): string | null {
  const m = src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1] : null;
}

/** Evaluate the mockup's tiny DCLogic component with an optional state override. */
export function evalRenderVals(src: string, state: Record<string, unknown> = {}): DcVals {
  const code = extractScript(src);
  if (!code) return {};
  const factory = new Function(
    "DCLogic",
    `${code}\n;return Component;`,
  ) as (base: unknown) => new (props: unknown) => { state: Record<string, unknown>; renderVals(): DcVals };
  class DCLogic {
    props: unknown;
    state: Record<string, unknown> = {};
    constructor(props: unknown) {
      this.props = props;
    }
    setState(s: Record<string, unknown>) {
      this.state = { ...this.state, ...s };
    }
  }
  const Component = factory(DCLogic);
  const inst = new Component({});
  inst.state = { ...inst.state, ...state };
  return inst.renderVals();
}

function holeValue(vals: DcVals, expr: string): unknown {
  const key = expr.trim();
  if (key in vals) return vals[key];
  if (key === "true") return true;
  if (key === "false") return false;
  return undefined;
}

export function resolveTemplate(body: string, vals: DcVals): string {
  let out = body;
  // sc-if blocks can be nested only shallowly in these mockups; loop until stable.
  const ifRe = /<sc-if\s+value="\{\{([^}]*)\}\}"[^>]*>([\s\S]*?)<\/sc-if>/;
  for (let i = 0; i < 200 && ifRe.test(out); i++) {
    out = out.replace(ifRe, (_all, expr: string, inner: string) => {
      const v = holeValue(vals, expr);
      return v ? inner : "";
    });
  }
  out = out.replace(/<\/?sc-for[^>]*>/g, "");
  out = out.replace(/\s(on[A-Z][a-zA-Z]*)="\{\{[^}]*\}\}"/g, "");
  out = out.replace(/\{\{([^}]*)\}\}/g, (_a, expr: string) => {
    const v = holeValue(vals, expr);
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  });
  return out;
}

export function unwrapDc(
  src: string,
  opts: { cssHref: string; fontHrefs: string[]; state?: Record<string, unknown> },
): string {
  const title = src.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Mockup";
  const helmet = src.match(/<helmet>([\s\S]*?)<\/helmet>/)?.[1] ?? "";
  const helmetClean = helmet.replace(/<link[^>]*fonts\.googleapis[^>]*>/g, "");
  const body = src.match(/<x-dc>([\s\S]*?)<\/x-dc>/)?.[1] ?? "";
  const bodyNoHelmet = body.replace(/<helmet>[\s\S]*?<\/helmet>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  const vals = evalRenderVals(src, opts.state);
  const resolved = resolveTemplate(bodyNoHelmet, vals);
  const fonts = opts.fontHrefs.map((h) => `<link rel="stylesheet" href="${h}">`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
${fonts}
<link rel="stylesheet" href="${opts.cssHref}">
${helmetClean}
</head><body>${resolved}</body></html>`;
}

/** Preview size declared by the mockup, if any. */
export function previewSize(src: string): { width: number; height: number } | null {
  const m = src.match(/data-props='([^']*)'/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[1]) as { $preview?: { width: number; height: number } };
    return p.$preview ?? null;
  } catch {
    return null;
  }
}
