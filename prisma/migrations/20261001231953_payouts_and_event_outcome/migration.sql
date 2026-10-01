-- CreateEnum
CREATE TYPE "EventOutcome" AS ENUM ('applied', 'stale', 'ignored');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'in_transit', 'paid', 'failed', 'canceled');

-- AlterTable
ALTER TABLE "stripe_events" ADD COLUMN     "outcome" "EventOutcome";

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "connected_account_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL,
    "failure_code" TEXT,
    "arrival_date" TIMESTAMPTZ,
    "status_changed_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payouts_status_status_changed_at_idx" ON "payouts"("status", "status_changed_at");

-- CreateIndex
CREATE INDEX "payouts_connected_account_id_idx" ON "payouts"("connected_account_id");
