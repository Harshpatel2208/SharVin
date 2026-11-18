ALTER TABLE "users"
    ADD COLUMN "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "verification_otp" TEXT,
    ADD COLUMN "verification_otp_expires_at" TIMESTAMP(3),
    ADD COLUMN "verification_otp_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "verification_otp_last_sent_at" TIMESTAMP(3);

-- Preserve access for accounts that existed before email verification was introduced.
UPDATE "users"
SET "is_email_verified" = true
WHERE "email" IS NOT NULL AND "password_hash" IS NOT NULL;

CREATE INDEX "users_is_email_verified_idx" ON "users"("is_email_verified");
