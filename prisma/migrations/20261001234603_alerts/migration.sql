-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('payout_failed', 'payout_stuck', 'event_unprocessable');

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "raised_at" TIMESTAMPTZ NOT NULL,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_resolved_at_idx" ON "alerts"("resolved_at");

-- At most one open alert per type and subject.
CREATE UNIQUE INDEX "alerts_one_open_per_type_and_subject"
  ON "alerts" ("type", "subject_id")
  WHERE "resolved_at" IS NULL;
