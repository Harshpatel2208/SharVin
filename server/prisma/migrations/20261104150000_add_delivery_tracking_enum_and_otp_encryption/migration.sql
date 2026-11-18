-- P0.3 Delivery persistence hardening:
--   1) Convert deliveries.tracking_mode from String ('local'/'regional') to the
--      TrackingMode enum (LOCAL_GPS/HIGHWAY_HUB), preserving existing rows.
--   2) Add deliveries.delivery_otp_encrypted so the retailer handover OTP is
--      retrievable from PostgreSQL (replacing the in-memory record cache).
-- Credit terms (RetailerWholesalerConnection.credit_limit/payment_term_days) and
-- owner PIN (profiles.owner_pin_hash) were already persisted; no change needed.

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('LOCAL_GPS', 'HIGHWAY_HUB');

-- AlterTable: add encrypted OTP column (nullable; backfilled on next dispatch)
ALTER TABLE "deliveries" ADD COLUMN "delivery_otp_encrypted" TEXT;

-- AlterTable: non-destructive String -> Enum conversion with value remap
ALTER TABLE "deliveries" ADD COLUMN "tracking_mode_new" "TrackingMode";
UPDATE "deliveries"
  SET "tracking_mode_new" = CASE
    WHEN "tracking_mode" = 'regional' THEN 'HIGHWAY_HUB'::"TrackingMode"
    ELSE 'LOCAL_GPS'::"TrackingMode"
  END;
ALTER TABLE "deliveries" DROP COLUMN "tracking_mode";
ALTER TABLE "deliveries" RENAME COLUMN "tracking_mode_new" TO "tracking_mode";
ALTER TABLE "deliveries" ALTER COLUMN "tracking_mode" SET DEFAULT 'LOCAL_GPS';
ALTER TABLE "deliveries" ALTER COLUMN "tracking_mode" SET NOT NULL;
