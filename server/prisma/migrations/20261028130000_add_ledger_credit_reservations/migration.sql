CREATE TYPE "LedgerCreditReservationStatus" AS ENUM ('reserved', 'consumed', 'released');

ALTER TABLE "ledger_accounts"
    ADD COLUMN "reserved_credit" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    ADD CONSTRAINT "ledger_accounts_reserved_credit_nonnegative_check" CHECK ("reserved_credit" >= 0);

CREATE TABLE "ledger_credit_reservations" (
    "credit_reservation_id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "LedgerCreditReservationStatus" NOT NULL DEFAULT 'reserved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    CONSTRAINT "ledger_credit_reservations_pkey" PRIMARY KEY ("credit_reservation_id"),
    CONSTRAINT "ledger_credit_reservations_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "ledger_credit_reservations_order_id_key"
    ON "ledger_credit_reservations"("order_id");
CREATE INDEX "ledger_credit_reservations_ledger_id_status_idx"
    ON "ledger_credit_reservations"("ledger_id", "status");

ALTER TABLE "ledger_credit_reservations"
    ADD CONSTRAINT "ledger_credit_reservations_ledger_id_fkey"
    FOREIGN KEY ("ledger_id") REFERENCES "ledger_accounts"("ledger_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_credit_reservations"
    ADD CONSTRAINT "ledger_credit_reservations_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("order_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
