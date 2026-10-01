export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    time: new Date().toISOString(),
  });
}
