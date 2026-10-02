import { defineConfig } from "@playwright/test";

const PORT = 3100;

// The server under test always gets the local database and throwaway
// secrets from here. Values set in the environment win over .env files, so
// this can never reach the hosted database.
export const E2E_ENV = {
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5433/payout_ledger_test",
  SIMULATOR_WEBHOOK_SECRET: "whsec_e2e_simulator",
  CRON_SECRET: "e2e-cron-secret",
  STRIPE_WEBHOOK_SECRET: "",
  SENTRY_DSN: "",
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // CI downloads Chromium; locally, use the installed Chrome.
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    env: E2E_ENV,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
