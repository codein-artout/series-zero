/**
 * Renders design/mockups/*.dc.html to PNG in design/rendered/ (git-ignored).
 * Desktop artboards at 1440, phone artboards (M-*) at 390. PitchRoom renders at beat 2 and beat 4.
 * Fonts are self-hosted from @fontsource; any external request is blocked.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { unwrapDc, previewSize } from "../lib/qa/dc";
import { FONTSOURCE_CSS } from "../lib/qa/fonts";
import { serveStatic } from "../lib/qa/static-server";

const ROOT = path.resolve(import.meta.dirname, "..");
const MOCKS = path.join(ROOT, "design/mockups");
const OUT = path.join(ROOT, "design/rendered");
const HTML_OUT = path.join(OUT, "html");

export interface RenderJob {
  name: string;
  file: string;
  width: number;
  state?: Record<string, unknown>;
}

export function jobs(): RenderJob[] {
  const files = fs.readdirSync(MOCKS).filter((f) => f.endsWith(".dc.html")).sort();
  const out: RenderJob[] = [];
  for (const f of files) {
    const base = f.replace(".dc.html", "");
    const width = base.startsWith("M-") ? 390 : 1440;
    if (base === "PitchRoom") {
      out.push({ name: "PitchRoom-beat2", file: f, width, state: { beat: 2 } });
      out.push({ name: "PitchRoom-beat4", file: f, width, state: { beat: 4 } });
    } else {
      out.push({ name: base, file: f, width });
    }
  }
  return out;
}

async function main() {
  fs.mkdirSync(HTML_OUT, { recursive: true });
  const fontHrefs = FONTSOURCE_CSS.map((p) => `/node_modules/${p}`);
  const list = jobs();
  for (const j of list) {
    const src = fs.readFileSync(path.join(MOCKS, j.file), "utf8");
    const html = unwrapDc(src, { cssHref: "/design/mockups/sz.css", fontHrefs, state: j.state });
    fs.writeFileSync(path.join(HTML_OUT, `${j.name}.html`), html);
  }
  const server = await serveStatic(ROOT);
  const browser = await chromium.launch();
  try {
    for (const j of list) {
      const src = fs.readFileSync(path.join(MOCKS, j.file), "utf8");
      const size = previewSize(src);
      const page = await browser.newPage({ viewport: { width: j.width, height: size?.height ?? 900 }, deviceScaleFactor: 1 });
      await page.route("**/*", (route) =>
        route.request().url().startsWith(server.url) ? route.continue() : route.abort(),
      );
      await page.goto(`${server.url}/design/rendered/html/${j.name}.html`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(OUT, `${j.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      await page.close();
      console.log(`rendered ${path.relative(ROOT, file)} @${j.width}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
