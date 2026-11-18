-- Roadmap item #1 (final persistence slice): eradicate the last in-memory maps in
-- delivery.service.ts by backing them with PostgreSQL.
--   1) credit_notes       - statutory B2B credit notes (was IN_MEMORY_CREDIT_NOTES)
--   2) delivery_disputes  - doorstep damage disputes + escrow hold (was IN_MEMORY_DISPUTES)
--   3) delivery_rebalances- immutable before/after stock rebalance report (was IN_MEMORY_REBALANCES)
-- Additive only: no existing table or column is altered, so no data can be lost.

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'under_review', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('issued', 'approved_by_wholesaler', 'settled');

-- CreateTable
CREATE TABLE "credit_notes" (
    "credit_note_id" TEXT NOT NULL,
    "credit_note_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "original_invoice_id" TEXT,
    "original_invoice_number" TEXT,
    "wholesaler_id" TEXT NOT NULL,
    "wholesaler_name" TEXT NOT NULL,
    "wholesaler_gstin" TEXT,
    "wholesaler_address" TEXT,
    "wholesaler_pan" TEXT,
    "wholesaler_contact" TEXT,
    "retailer_id" TEXT NOT NULL,
    "retailer_name" TEXT NOT NULL,
    "retailer_gstin" TEXT,
    "retailer_address" TEXT,
    "retailer_pan" TEXT,
    "retailer_contact" TEXT,
    "reason" TEXT,
    "original_order_amount" DECIMAL(12,2) NOT NULL,
    "accepted_order_amount" DECIMAL(12,2) NOT NULL,
    "taxable_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "gst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "credit_note_amount" DECIMAL(12,2) NOT NULL,
    "items_snapshot" JSONB NOT NULL,
    "double_entry_journal" JSONB NOT NULL,
    "signature_hash" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'issued',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("credit_note_id")
);

-- CreateTable
CREATE TABLE "delivery_disputes" (
    "dispute_id" TEXT NOT NULL,
    "dispute_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "delivery_id" TEXT,
    "credit_note_id" TEXT,
    "retailer_id" TEXT NOT NULL,
    "retailer_name" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "wholesaler_name" TEXT NOT NULL,
    "reported_by" TEXT NOT NULL,
    "damaged_qty" INTEGER NOT NULL DEFAULT 0,
    "proof_image_url" TEXT,
    "dispute_reason" TEXT,
    "total_claim_amount" DECIMAL(12,2) NOT NULL,
    "escrow_hold_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "inspection_snapshot" JSONB,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_disputes_pkey" PRIMARY KEY ("dispute_id")
);

-- CreateTable
CREATE TABLE "delivery_rebalances" (
    "rebalance_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "delivery_id" TEXT,
    "retailer_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "retailer_name" TEXT NOT NULL,
    "wholesaler_name" TEXT NOT NULL,
    "is_delivered" BOOLEAN NOT NULL DEFAULT true,
    "delivered_at" TIMESTAMP(3),
    "total_units_transferred" INTEGER NOT NULL DEFAULT 0,
    "total_damaged_units" INTEGER NOT NULL DEFAULT 0,
    "is_partial_delivery" BOOLEAN NOT NULL DEFAULT false,
    "adjusted_order_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "total_alerts_resolved" INTEGER NOT NULL DEFAULT 0,
    "items_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_rebalances_pkey" PRIMARY KEY ("rebalance_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_credit_note_number_key" ON "credit_notes"("credit_note_number");

-- CreateIndex
CREATE INDEX "credit_notes_order_id_idx" ON "credit_notes"("order_id");

-- CreateIndex
CREATE INDEX "credit_notes_order_number_idx" ON "credit_notes"("order_number");

-- CreateIndex
CREATE INDEX "credit_notes_retailer_id_idx" ON "credit_notes"("retailer_id");

-- CreateIndex
CREATE INDEX "credit_notes_wholesaler_id_idx" ON "credit_notes"("wholesaler_id");

-- CreateIndex
CREATE INDEX "credit_notes_status_idx" ON "credit_notes"("status");

-- CreateIndex
CREATE INDEX "credit_notes_issued_at_idx" ON "credit_notes"("issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_disputes_dispute_number_key" ON "delivery_disputes"("dispute_number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_disputes_credit_note_id_key" ON "delivery_disputes"("credit_note_id");

-- CreateIndex
CREATE INDEX "delivery_disputes_order_id_idx" ON "delivery_disputes"("order_id");

-- CreateIndex
CREATE INDEX "delivery_disputes_delivery_id_idx" ON "delivery_disputes"("delivery_id");

-- CreateIndex
CREATE INDEX "delivery_disputes_retailer_id_idx" ON "delivery_disputes"("retailer_id");

-- CreateIndex
CREATE INDEX "delivery_disputes_wholesaler_id_idx" ON "delivery_disputes"("wholesaler_id");

-- CreateIndex
CREATE INDEX "delivery_disputes_status_idx" ON "delivery_disputes"("status");

-- CreateIndex
CREATE INDEX "delivery_disputes_created_at_idx" ON "delivery_disputes"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_rebalances_order_id_key" ON "delivery_rebalances"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_rebalances_delivery_id_key" ON "delivery_rebalances"("delivery_id");

-- CreateIndex
CREATE INDEX "delivery_rebalances_retailer_id_idx" ON "delivery_rebalances"("retailer_id");

-- CreateIndex
CREATE INDEX "delivery_rebalances_wholesaler_id_idx" ON "delivery_rebalances"("wholesaler_id");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_original_invoice_id_fkey" FOREIGN KEY ("original_invoice_id") REFERENCES "invoices"("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_disputes" ADD CONSTRAINT "delivery_disputes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_disputes" ADD CONSTRAINT "delivery_disputes_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("delivery_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_disputes" ADD CONSTRAINT "delivery_disputes_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("credit_note_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_disputes" ADD CONSTRAINT "delivery_disputes_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_disputes" ADD CONSTRAINT "delivery_disputes_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_rebalances" ADD CONSTRAINT "delivery_rebalances_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_rebalances" ADD CONSTRAINT "delivery_rebalances_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("delivery_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_rebalances" ADD CONSTRAINT "delivery_rebalances_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_rebalances" ADD CONSTRAINT "delivery_rebalances_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
