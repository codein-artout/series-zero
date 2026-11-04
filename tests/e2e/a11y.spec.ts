import { expect, test } from "@playwright/test";
import { expectNoSeriousA11y } from "./helpers";

const STATIC = ["/", "/floor", "/create", "/pitch/latest", "/company/mine", "/fund/mine", "/wire", "/demo-day", "/cards", "/dev/components", "/admin", "/signin"];

for (const width of [1440, 390]) {
  test.describe(`axe at ${width}`, () => {
    test.use({ viewport: { width, height: width < 640 ? 844 : 1000 } });
    for (const route of STATIC) {
      test(`${route} has no serious or critical violations`, async ({ page }) => {
        const res = await page.goto(route);
        expect(res?.status()).toBeLessThan(400);
        await expect(page.locator("h1").first()).toBeVisible();
        await expectNoSeriousA11y(page);
      });
    }
    test("dynamic routes: offer and card pages", async ({ page }) => {
      await page.goto("/floor");
      const offer = await page.locator('a[href^="/offers/"]').first().getAttribute("href");
      if (offer) {
        await page.goto(offer);
        await expectNoSeriousA11y(page);
      }
      await page.goto("/cards");
      const card = await page.locator('a[href^="/cards/"]').first().getAttribute("href");
      expect(card).toBeTruthy();
      await page.goto(card!);
      await expectNoSeriousA11y(page);
    });
  });
}
