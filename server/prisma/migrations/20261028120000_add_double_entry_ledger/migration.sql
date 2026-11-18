CREATE TYPE "LedgerAccountCode" AS ENUM (
    'accounts_receivable',
    'sales_revenue',
    'cash',
    'sales_returns',
    'escrow_receivable',
    'escrow_liability'
);

ALTER TABLE "ledger_transactions"
    ADD COLUMN "source_event_key" TEXT,
    ADD COLUMN "reversal_of_id" TEXT;

UPDATE "ledger_transactions"
SET "source_event_key" = 'legacy-ledger:' || "transaction_id"
WHERE "source_event_key" IS NULL;
ALTER TABLE "ledger_transactions" ALTER COLUMN "source_event_key" SET NOT NULL;

CREATE UNIQUE INDEX "ledger_transactions_source_event_key_key"
    ON "ledger_transactions"("source_event_key");
CREATE UNIQUE INDEX "ledger_transactions_reversal_of_id_key"
    ON "ledger_transactions"("reversal_of_id");
CREATE INDEX "ledger_transactions_order_id_transaction_type_idx"
    ON "ledger_transactions"("order_id", "transaction_type");

ALTER TABLE "ledger_transactions"
    ADD CONSTRAINT "ledger_transactions_reversal_of_id_fkey"
    FOREIGN KEY ("reversal_of_id") REFERENCES "ledger_transactions"("transaction_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ledger_entries" (
    "ledger_entry_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "account_code" "LedgerAccountCode" NOT NULL,
    "debit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "credit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("ledger_entry_id"),
    CONSTRAINT "ledger_entries_nonnegative_check" CHECK ("debit_amount" >= 0 AND "credit_amount" >= 0),
    CONSTRAINT "ledger_entries_one_side_positive_check" CHECK (("debit_amount" = 0) <> ("credit_amount" = 0))
);

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("transaction_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");
CREATE INDEX "ledger_entries_account_code_created_at_idx" ON "ledger_entries"("account_code", "created_at");

-- Preserve prior postings as balanced journal pairs. The original transaction
-- remains untouched and receives a stable legacy source-event key above.
INSERT INTO "ledger_entries" (
    "ledger_entry_id", "transaction_id", "account_code", "debit_amount", "credit_amount", "currency", "created_at"
)
SELECT
    'legacy-entry:' || t."transaction_id" || ':debit',
    t."transaction_id",
    CASE
        WHEN t."notes" ILIKE '%Escrow Hold%' THEN 'escrow_receivable'::"LedgerAccountCode"
        WHEN t."notes" ILIKE '%Escrow Released%' THEN 'escrow_liability'::"LedgerAccountCode"
        WHEN t."transaction_type" = 'payment_received' THEN 'cash'::"LedgerAccountCode"
        WHEN t."transaction_type" = 'damage_refund' OR (t."transaction_type" = 'adjustment' AND t."is_credit") THEN 'sales_returns'::"LedgerAccountCode"
        ELSE 'accounts_receivable'::"LedgerAccountCode"
    END,
    t."amount",
    0.00,
    'INR',
    t."created_at"
FROM "ledger_transactions" t
WHERE t."amount" > 0;

INSERT INTO "ledger_entries" (
    "ledger_entry_id", "transaction_id", "account_code", "debit_amount", "credit_amount", "currency", "created_at"
)
SELECT
    'legacy-entry:' || t."transaction_id" || ':credit',
    t."transaction_id",
    CASE
        WHEN t."notes" ILIKE '%Escrow Hold%' THEN 'escrow_liability'::"LedgerAccountCode"
        WHEN t."transaction_type" = 'payment_received' OR t."transaction_type" = 'damage_refund' OR (t."transaction_type" = 'adjustment' AND t."is_credit") THEN 'accounts_receivable'::"LedgerAccountCode"
        ELSE 'sales_revenue'::"LedgerAccountCode"
    END,
    0.00,
    t."amount",
    'INR',
    t."created_at"
FROM "ledger_transactions" t
WHERE t."amount" > 0;

CREATE FUNCTION "assert_ledger_transaction_balanced"() RETURNS TRIGGER AS $$
DECLARE
    target_transaction_id TEXT;
    entry_count BIGINT;
    debit_total NUMERIC(18,2);
    credit_total NUMERIC(18,2);
BEGIN
    target_transaction_id := NEW."transaction_id";
    SELECT COUNT(*), COALESCE(SUM("debit_amount"), 0), COALESCE(SUM("credit_amount"), 0)
      INTO entry_count, debit_total, credit_total
      FROM "ledger_entries"
      WHERE "transaction_id" = target_transaction_id;
    IF entry_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
        RAISE EXCEPTION 'Ledger transaction % must have balanced debit and credit entries', target_transaction_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ledger_transaction_balanced_after_insert"
AFTER INSERT ON "ledger_transactions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_ledger_transaction_balanced"();

CREATE CONSTRAINT TRIGGER "ledger_entries_balanced_after_insert"
AFTER INSERT ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_ledger_transaction_balanced"();

CREATE FUNCTION "reject_ledger_journal_mutation"() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Ledger journal records are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_transactions_append_only"
BEFORE UPDATE OR DELETE ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION "reject_ledger_journal_mutation"();

CREATE TRIGGER "ledger_entries_append_only"
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "reject_ledger_journal_mutation"();

CREATE FUNCTION "require_ledger_source_event_key"() RETURNS TRIGGER AS $$
BEGIN
    IF NEW."source_event_key" IS NULL OR length(trim(NEW."source_event_key")) = 0 THEN
        RAISE EXCEPTION 'Ledger transaction source_event_key is required';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_transactions_require_source_event"
BEFORE INSERT ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION "require_ledger_source_event_key"();
