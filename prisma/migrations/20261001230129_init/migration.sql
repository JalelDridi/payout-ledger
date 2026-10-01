-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('stripe', 'simulator');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('external', 'platform', 'seller');

-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('charge', 'transfer', 'payout', 'payout_reversal');

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" "EventSource" NOT NULL,
    "api_created" TIMESTAMPTZ NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "connected_account_id" TEXT,
    "allow_negative" BOOLEAN NOT NULL DEFAULT false,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "stripe_object_id" TEXT NOT NULL,
    "source_event_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stripe_events_processed_at_api_created_idx" ON "stripe_events"("processed_at", "api_created");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_connected_account_id_key" ON "accounts"("connected_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotency_key_key" ON "ledger_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_transactions_stripe_object_id_idx" ON "ledger_transactions"("stripe_object_id");

-- CreateIndex
CREATE INDEX "ledger_transactions_source_event_id_idx" ON "ledger_transactions"("source_event_id");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_idx" ON "ledger_entries"("account_id");

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "stripe_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariants Prisma cannot express. See docs/schema.md.
-- ---------------------------------------------------------------------------

-- An account's balance may only go negative if explicitly allowed.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_balance_non_negative"
  CHECK ("allow_negative" OR "balance" >= 0);

-- An entry must move money.
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_amount_non_zero"
  CHECK ("amount" <> 0);

-- Keep accounts.balance equal to the sum of the account's entries. The UPDATE
-- takes the account's row lock, and the CHECK above rejects an overdraft.
CREATE FUNCTION apply_entry_to_balance() RETURNS trigger AS $$
BEGIN
  UPDATE "accounts" SET "balance" = "balance" + NEW."amount" WHERE "id" = NEW."account_id";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_apply_balance"
  AFTER INSERT ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION apply_entry_to_balance();

-- Every transaction must have at least two entries that sum to zero.
-- Deferred, so it is checked at commit, once all entries are written.
CREATE FUNCTION assert_transaction_balanced() RETURNS trigger AS $$
DECLARE
  tx_id uuid;
  entry_count integer;
  entry_sum numeric;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    tx_id := NEW."id";
  ELSE
    tx_id := NEW."transaction_id";
  END IF;

  SELECT count(*), coalesce(sum("amount"), 0)
    INTO entry_count, entry_sum
    FROM "ledger_entries"
   WHERE "transaction_id" = tx_id;

  IF entry_count < 2 OR entry_sum <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is not balanced (entries: %, sum: %)',
      tx_id, entry_count, entry_sum
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_transactions_balanced';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ledger_transactions_balanced"
  AFTER INSERT ON "ledger_transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_transaction_balanced();

CREATE CONSTRAINT TRIGGER "ledger_entries_balanced"
  AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_transaction_balanced();

-- The ledger is append-only. Corrections are new, reversing transactions.
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING CONSTRAINT = 'ledger_append_only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE TRIGGER "ledger_transactions_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
