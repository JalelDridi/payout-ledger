import { isAuthorized } from "@/auth";
import { getDb } from "@/db/client";
import { runJobs } from "@/jobs/run";

export const maxDuration = 60;

// Called on a schedule by GitHub Actions (ADR 6).
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await runJobs(getDb()));
}
