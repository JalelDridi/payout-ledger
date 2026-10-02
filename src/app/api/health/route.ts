import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "unreachable" = "ok";
  try {
    await getDb().$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }

  return Response.json(
    {
      status: database === "ok" ? "ok" : "degraded",
      database,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      time: new Date().toISOString(),
    },
    { status: database === "ok" ? 200 : 503 },
  );
}
