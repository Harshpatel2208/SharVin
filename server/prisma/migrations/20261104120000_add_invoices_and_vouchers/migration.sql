-- P0.1 Invoice & Voucher Persistence
-- These tables already existed in schema.prisma (created earlier via `prisma db push`);
-- this migration baselines them into the versioned history so production deploys via
-- `prisma migrate deploy` create them too. DDL matches prisma migrate diff output exactly.

-- CreateTable
CREATE TABLE "khata_settlement_vouchers" (
    "voucher_id" TEXT NOT NULL,
    "voucher_number" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "payment_record_id" TEXT,
    "transaction_id" TEXT,
    "retailer_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "settlement_cycle" TEXT NOT NULL DEFAULT '15_days',
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_reference" TEXT,
    "opening_balance" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL,
    "closing_balance" DECIMAL(12,2) NOT NULL,
    "digital_signature_hash" TEXT NOT NULL,
    "notes" TEXT,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "khata_settlement_vouchers_pkey" PRIMARY KEY ("voucher_id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "invoice_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "wholesaler_name" TEXT NOT NULL,
    "wholesaler_gstin" TEXT NOT NULL,
    "wholesaler_state" TEXT NOT NULL DEFAULT 'Delhi',
    "wholesaler_address" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "retailer_name" TEXT NOT NULL,
    "retailer_gstin" TEXT NOT NULL,
    "retailer_state" TEXT NOT NULL DEFAULT 'Delhi',
    "retailer_address" TEXT NOT NULL,
    "taxable_amount" DECIMAL(12,2) NOT NULL,
    "cgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "sgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "igst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "total_tax_amount" DECIMAL(12,2) NOT NULL,
    "total_invoice_amount" DECIMAL(12,2) NOT NULL,
    "items_snapshot" JSONB NOT NULL,
    "signature_hash" TEXT NOT NULL,
    "qr_code_data" TEXT NOT NULL,
    "is_inter_state" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "khata_settlement_vouchers_voucher_number_key" ON "khata_settlement_vouchers"("voucher_number");

-- CreateIndex
CREATE UNIQUE INDEX "khata_settlement_vouchers_receipt_number_key" ON "khata_settlement_vouchers"("receipt_number");

-- CreateIndex
CREATE INDEX "khata_settlement_vouchers_ledger_id_idx" ON "khata_settlement_vouchers"("ledger_id");

-- CreateIndex
CREATE INDEX "khata_settlement_vouchers_retailer_id_idx" ON "khata_settlement_vouchers"("retailer_id");

-- CreateIndex
CREATE INDEX "khata_settlement_vouchers_wholesaler_id_idx" ON "khata_settlement_vouchers"("wholesaler_id");

-- CreateIndex
CREATE INDEX "khata_settlement_vouchers_voucher_number_idx" ON "khata_settlement_vouchers"("voucher_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_wholesaler_id_idx" ON "invoices"("wholesaler_id");

-- CreateIndex
CREATE INDEX "invoices_retailer_id_idx" ON "invoices"("retailer_id");

-- CreateIndex
CREATE INDEX "invoices_invoice_number_idx" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_issued_at_idx" ON "invoices"("issued_at");

-- AddForeignKey
ALTER TABLE "khata_settlement_vouchers" ADD CONSTRAINT "khata_settlement_vouchers_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledger_accounts"("ledger_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_settlement_vouchers" ADD CONSTRAINT "khata_settlement_vouchers_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_settlement_vouchers" ADD CONSTRAINT "khata_settlement_vouchers_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_settlement_vouchers" ADD CONSTRAINT "khata_settlement_vouchers_payment_record_id_fkey" FOREIGN KEY ("payment_record_id") REFERENCES "payment_records"("payment_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
