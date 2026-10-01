-- CreateEnum
CREATE TYPE "ObjectKind" AS ENUM ('charge', 'transfer', 'payout');

-- CreateEnum
CREATE TYPE "MismatchType" AS ENUM ('missing_locally', 'missing_at_source', 'amount_mismatch', 'status_mismatch');

-- CreateTable
CREATE TABLE "source_objects" (
    "id" TEXT NOT NULL,
    "kind" "ObjectKind" NOT NULL,
    "connected_account_id" TEXT,
    "amount" BIGINT NOT NULL,
    "status" "PayoutStatus",
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "source_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "finished_at" TIMESTAMPTZ NOT NULL,
    "objects_checked" INTEGER NOT NULL,
    "opened" INTEGER NOT NULL,
    "still_open" INTEGER NOT NULL,
    "resolved" INTEGER NOT NULL,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mismatches" (
    "id" UUID NOT NULL,
    "object_id" TEXT NOT NULL,
    "object_kind" "ObjectKind" NOT NULL,
    "type" "MismatchType" NOT NULL,
    "details" JSONB NOT NULL,
    "detected_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "mismatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_runs_started_at_idx" ON "reconciliation_runs"("started_at");

-- CreateIndex
CREATE INDEX "mismatches_resolved_at_idx" ON "mismatches"("resolved_at");

-- At most one open mismatch per object and type. Prisma cannot express a
-- partial unique index.
CREATE UNIQUE INDEX "mismatches_one_open_per_object_and_type"
  ON "mismatches" ("object_id", "type")
  WHERE "resolved_at" IS NULL;
