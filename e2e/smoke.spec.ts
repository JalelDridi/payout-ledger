import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";

// One pass through the demo as a visitor would use it: a clean dashboard,
// a dropped webhook, the checks, and the mismatch they find.

test.beforeEach(async ({ request }) => {
  const reset = await request.get("/api/cron/reset", {
    headers: { authorization: `Bearer ${E2E_ENV.CRON_SECRET}` },
  });
  expect(reset.ok()).toBe(true);
});

test("a dropped webhook is caught by reconciliation", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Payout Ledger" }),
  ).toBeVisible();
  await expect(page.getByText("Ledger sums to zero")).toBeVisible();
  await expect(page.getByText("No mismatches found.")).toBeVisible();

  await page
    .getByRole("button", { name: "Send webhooks: Dropped webhook" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Dropped webhook: 4 webhooks sent.",
  );

  await page.getByRole("button", { name: "Run checks now" }).click();
  await expect(page.getByRole("status")).toContainText("1 open mismatch");

  await expect(page.getByText("Status differs")).toBeVisible();
  await expect(
    page.getByText("Source: paid. Ledger: in transit."),
  ).toBeVisible();
  await expect(page.getByText("Ledger sums to zero")).toBeVisible();
});

test("out-of-order webhooks wait, then apply when the checks run", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Send webhooks: Out-of-order delivery" })
    .click();
  await expect(page.getByText(/\d+ waiting to be applied/)).toBeVisible();

  await page.getByRole("button", { name: "Run checks now" }).click();

  await expect(page.getByRole("status")).toContainText("Checks finished.");
  await expect(page.getByText("All applied")).toBeVisible();
  await expect(page.getByText("No mismatches found.")).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`no detectable accessibility violations in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}
