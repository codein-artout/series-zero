import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export async function signInAs(page: Page, who: "guest" | "demo", next = "/floor") {
  await page.goto(`/signin?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: who === "guest" ? "Continue as guest" : "Continue as the demo coach" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

export async function expectNoSeriousA11y(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
}
