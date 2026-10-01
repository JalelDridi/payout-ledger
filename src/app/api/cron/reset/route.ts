import { isAuthorized } from "@/auth";
import { getDb } from "@/db/client";
import { resetDemo } from "@/demo/reset";

// Called nightly by Vercel Cron (see vercel.json), which uses GET.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  await resetDemo(getDb());
  return Response.json({ reset: true });
}
