ALTER TABLE "wholesaler_products"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "retailer_inventory"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
