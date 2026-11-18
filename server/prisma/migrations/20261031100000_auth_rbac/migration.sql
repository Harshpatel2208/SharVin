ALTER TABLE "retailer_sub_users"
    ADD COLUMN "email" TEXT,
    ADD COLUMN "password_hash" TEXT;

CREATE UNIQUE INDEX "retailer_sub_users_email_key"
    ON "retailer_sub_users"("email");
CREATE UNIQUE INDEX "retailer_sub_users_retailer_id_phone_number_key"
    ON "retailer_sub_users"("retailer_id", "phone_number");

CREATE TABLE "retailer_sub_user_permissions" (
    "permission_id" TEXT NOT NULL,
    "sub_user_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "retailer_sub_user_permissions_pkey" PRIMARY KEY ("permission_id")
);

CREATE UNIQUE INDEX "retailer_sub_user_permissions_sub_user_id_permission_key_key"
    ON "retailer_sub_user_permissions"("sub_user_id", "permission_key");
CREATE INDEX "retailer_sub_user_permissions_sub_user_id_idx"
    ON "retailer_sub_user_permissions"("sub_user_id");

ALTER TABLE "retailer_sub_user_permissions"
    ADD CONSTRAINT "retailer_sub_user_permissions_sub_user_id_fkey"
    FOREIGN KEY ("sub_user_id") REFERENCES "retailer_sub_users"("sub_user_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
