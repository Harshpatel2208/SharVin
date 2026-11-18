ALTER TABLE "khata_settlement_vouchers"
ADD COLUMN "idempotency_key" TEXT;

UPDATE "khata_settlement_vouchers" AS voucher
SET "idempotency_key" = COALESCE(
  (
    SELECT payment."idempotency_key"
    FROM "payment_records" AS payment
    WHERE payment."payment_id" = voucher."payment_record_id"
  ),
  'legacy-voucher:' || voucher."voucher_id"
);

ALTER TABLE "khata_settlement_vouchers"
ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE UNIQUE INDEX "khata_settlement_vouchers_idempotency_key_key"
ON "khata_settlement_vouchers"("idempotency_key");
