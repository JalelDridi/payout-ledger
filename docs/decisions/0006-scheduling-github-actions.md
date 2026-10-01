# 6. Scheduling: GitHub Actions calls a protected endpoint

Date: 2026-10-02 · Status: accepted

## Context

Three jobs need to run on a schedule: reconciliation, the check for stuck payouts, and the sweep of unprocessed inbox events. The app is hosted on Vercel's Hobby plan, where cron jobs can run at most once per day (verified against Vercel's docs on 2026-10-02). Everything must stay on free tiers.

## Options

1. **Vercel cron.** Configured in `vercel.json`, runs inside the platform.
   - Trade-off: once per day on Hobby, with up to an hour of jitter. Too slow to demonstrate stuck-payout detection.
2. **GitHub Actions schedule.** A workflow on a cron trigger sends an authenticated request to an endpoint in the app.
   - Trade-off: scheduled workflows can be delayed several minutes under load, and GitHub disables them after 60 days without repository activity.
3. **External cron service.**
   - Trade-off: another account and another secret, outside the repository.

## Decision

Option 2. A workflow runs every 15 minutes and calls `POST /api/jobs/run` with a bearer token stored as a repository secret. The dashboard also has a "run now" button for the demo.

## Consequences

- The schedule is version-controlled and its run history is public in the Actions tab.
- The job endpoint must be idempotent and safe to call concurrently, since a manual run and a scheduled run can overlap.
- Timing is approximate. Stuck-payout thresholds are measured in hours, so a few minutes of delay does not matter.
- If the repository goes quiet for 60 days the schedule stops; the nightly demo reset is a Vercel daily cron, which keeps working regardless.
