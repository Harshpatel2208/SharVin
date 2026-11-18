CREATE TYPE "OrderLifecycleStatus" AS ENUM (
    'draft',
    'submitted',
    'accepted',
    'picking',
    'dispatched',
    'delivered',
    'rejected',
    'cancelled',
    'partially_fulfilled'
);

CREATE TYPE "StockReservationStatus" AS ENUM ('reserved', 'released', 'fulfilled');

ALTER TABLE "orders"
    ADD COLUMN "lifecycle_status" "OrderLifecycleStatus" NOT NULL DEFAULT 'draft';

-- Initialize the new OMS projection from the legacy operational status.
-- The legacy order_status remains intact for cart, negotiation, and delivery compatibility.
UPDATE "orders"
SET "lifecycle_status" = CASE "order_status"::text
    WHEN 'negotiating' THEN CASE
        WHEN EXISTS (
            SELECT 1 FROM "negotiation_states" AS ns
            WHERE ns."order_id" = "orders"."order_id"
        ) THEN 'submitted'::"OrderLifecycleStatus"
        ELSE 'draft'::"OrderLifecycleStatus"
    END
    WHEN 'deal_locked' THEN 'accepted'::"OrderLifecycleStatus"
    WHEN 'confirmed' THEN 'accepted'::"OrderLifecycleStatus"
    WHEN 'packing' THEN 'picking'::"OrderLifecycleStatus"
    WHEN 'ready_for_dispatch' THEN 'picking'::"OrderLifecycleStatus"
    WHEN 'dispatched' THEN 'dispatched'::"OrderLifecycleStatus"
    WHEN 'in_transit' THEN 'dispatched'::"OrderLifecycleStatus"
    WHEN 'out_for_delivery' THEN 'dispatched'::"OrderLifecycleStatus"
    WHEN 'delivered' THEN 'delivered'::"OrderLifecycleStatus"
    WHEN 'cancelled' THEN 'cancelled'::"OrderLifecycleStatus"
    WHEN 'returned' THEN 'delivered'::"OrderLifecycleStatus"
    ELSE 'draft'::"OrderLifecycleStatus"
END;

CREATE TABLE "order_events" (
    "order_event_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" "OrderLifecycleStatus",
    "to_status" "OrderLifecycleStatus" NOT NULL,
    "actor_user_id" TEXT,
    "actor_role" "UserType" NOT NULL,
    "actor_source" TEXT NOT NULL DEFAULT 'authenticated_user',
    "actor_reference" TEXT,
    "reason" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_events_pkey" PRIMARY KEY ("order_event_id")
);

CREATE INDEX "order_events_order_id_created_at_idx"
    ON "order_events"("order_id", "created_at");
CREATE INDEX "order_events_actor_user_id_created_at_idx"
    ON "order_events"("actor_user_id", "created_at");

ALTER TABLE "order_events"
    ADD CONSTRAINT "order_events_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("order_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_events"
    ADD CONSTRAINT "order_events_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "wholesaler_stock_reservations" (
    "stock_reservation_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "wholesaler_product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'reserved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    CONSTRAINT "wholesaler_stock_reservations_pkey" PRIMARY KEY ("stock_reservation_id"),
    CONSTRAINT "wholesaler_stock_reservations_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "wholesaler_stock_reservations_order_item_id_key"
    ON "wholesaler_stock_reservations"("order_item_id");
CREATE INDEX "wholesaler_stock_reservations_order_id_status_idx"
    ON "wholesaler_stock_reservations"("order_id", "status");
CREATE INDEX "wholesaler_stock_reservations_wholesaler_product_id_status_idx"
    ON "wholesaler_stock_reservations"("wholesaler_product_id", "status");

ALTER TABLE "wholesaler_stock_reservations"
    ADD CONSTRAINT "wholesaler_stock_reservations_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("order_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wholesaler_stock_reservations"
    ADD CONSTRAINT "wholesaler_stock_reservations_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("order_item_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wholesaler_stock_reservations"
    ADD CONSTRAINT "wholesaler_stock_reservations_wholesaler_product_id_fkey"
    FOREIGN KEY ("wholesaler_product_id") REFERENCES "wholesaler_products"("wholesaler_product_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
