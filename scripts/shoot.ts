/**
 * Screenshots app routes at given widths into qa/screens/ and optionally runs axe.
 * Usage: tsx scripts/shoot.ts --base http://127.0.0.1:3000 --widths 1440,390 /floor /wire ...
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const args = process.argv.slice(2);
let base = "http://127.0.0.1:3000";
let widths = [1440, 390];
let axe = false;
let full = true;
const routes: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--base") base = args[++i];
  else if (a === "--widths") widths = args[++i].split(",").map(Number);
  else if (a === "--axe") axe = true;
  else if (a === "--viewport-only") full = false;
  else routes.push(a);
}
const OUT = path.resolve("qa/screens");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
let violations = 0;
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 640 ? 844 : 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: "load" });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.fonts.ready);
    const name = (r === "/" ? "home" : r.replace(/^\//, "").replace(/[/?=&]/g, "_")) + `@${w}.png`;
    await page.screenshot({ path: path.join(OUT, name), fullPage: full });
    let msg = `shot ${name}`;
    if (axe) {
      const res = await new AxeBuilder({ page }).analyze();
      const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      violations += bad.length;
      msg += ` axe: ${bad.length} serious/critical`;
      for (const v of bad) msg += `\n   - ${v.id} (${v.impact}): ${v.nodes.length} nodes e.g. ${v.nodes[0]?.target.join(" ")} :: ${v.nodes[0]?.failureSummary?.split("\n")[1] ?? ""}`;
    }
    console.log(msg);
  }
  await ctx.close();
}
await browser.close();
if (violations) process.exitCode = 1;
