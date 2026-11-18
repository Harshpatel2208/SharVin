-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('retailer', 'wholesaler', 'driver');

-- CreateEnum
CREATE TYPE "OtpType" AS ENUM ('login', 'registration', 'delivery_confirm', 'cash_handover', 'payment_verify', 'connection_verify');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('business', 'pickup', 'delivery', 'billing');

-- CreateEnum
CREATE TYPE "StoreSize" AS ENUM ('small', 'medium', 'large');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('active', 'blocked_by_retailer', 'blocked_by_wholesaler', 'removed');

-- CreateEnum
CREATE TYPE "BlockRequestType" AS ENUM ('block', 'remove');

-- CreateEnum
CREATE TYPE "BlockRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('negotiating', 'deal_locked', 'confirmed', 'packing', 'ready_for_dispatch', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'returned');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('local_driver', 'threePL_shipping');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'driver_assigned', 'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'file', 'product_broadcast', 'system');

-- CreateEnum
CREATE TYPE "SenderUserType" AS ENUM ('retailer', 'wholesaler', 'sub_user');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank_transfer', 'upi', 'cheque');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "CollectorType" AS ENUM ('driver', 'sales_person');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('order_placed', 'payment_received', 'damage_refund', 'adjustment');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('pending', 'approved', 'rejected', 'settled');

-- CreateEnum
CREATE TYPE "PhysicalReturnStatus" AS ENUM ('pending', 'scheduled', 'picked_up', 'received');

-- CreateEnum
CREATE TYPE "ReturnUrgency" AS ENUM ('normal', 'urgent');

-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('reported', 'replacement_given', 'sent_to_wholesaler', 'sent_to_manufacturer', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trial', 'active', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('web', 'android', 'ios');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('android', 'ios', 'web');

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "phone_number" TEXT,
    "email" TEXT,
    "password_hash" TEXT,
    "user_type" "UserType" NOT NULL,
    "full_name" TEXT NOT NULL,
    "business_name" TEXT,
    "profile_image_url" TEXT,
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "otps" (
    "otp_id" TEXT NOT NULL,
    "user_id" TEXT,
    "phone_number" TEXT,
    "email" TEXT,
    "otp_code" TEXT NOT NULL,
    "otp_type" "OtpType" NOT NULL,
    "reference_id" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otps_pkey" PRIMARY KEY ("otp_id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "address_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "address_type" "AddressType",
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("address_id")
);

-- CreateTable
CREATE TABLE "wholesaler_profiles" (
    "profile_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "gst_number" TEXT,
    "pan_number" TEXT,
    "business_category" TEXT,
    "description" TEXT,
    "has_inventory_tracking" BOOLEAN NOT NULL DEFAULT true,
    "default_delivery_range_km" INTEGER NOT NULL DEFAULT 100,
    "bank_account_number" TEXT,
    "bank_ifsc_code" TEXT,
    "bank_account_holder_name" TEXT,
    "bank_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wholesaler_profiles_pkey" PRIMARY KEY ("profile_id")
);

-- CreateTable
CREATE TABLE "retailer_profiles" (
    "profile_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "gst_number" TEXT,
    "pan_number" TEXT,
    "business_category" TEXT,
    "store_size" "StoreSize",
    "reorder_pref_price" INTEGER NOT NULL DEFAULT 40,
    "reorder_pref_relationship" INTEGER NOT NULL DEFAULT 30,
    "reorder_pref_distance" INTEGER NOT NULL DEFAULT 20,
    "reorder_pref_speed" INTEGER NOT NULL DEFAULT 10,
    "reorder_buffer_days" INTEGER NOT NULL DEFAULT 20,
    "stock_alert_time_1" TEXT NOT NULL DEFAULT '14:00:00',
    "stock_alert_time_2" TEXT NOT NULL DEFAULT '20:00:00',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_profiles_pkey" PRIMARY KEY ("profile_id")
);

-- CreateTable
CREATE TABLE "wholesaler_sub_users" (
    "sub_user_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "secret_code" TEXT,
    "password_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wholesaler_sub_users_pkey" PRIMARY KEY ("sub_user_id")
);

-- CreateTable
CREATE TABLE "sub_user_permissions" (
    "permission_id" TEXT NOT NULL,
    "sub_user_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_user_permissions_pkey" PRIMARY KEY ("permission_id")
);

-- CreateTable
CREATE TABLE "retailer_wholesaler_connections" (
    "connection_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "connected_by_sub_user_id" TEXT,
    "connection_status" "ConnectionStatus" NOT NULL DEFAULT 'active',
    "can_block" BOOLEAN NOT NULL DEFAULT true,
    "block_reason" TEXT,
    "total_orders_placed" INTEGER NOT NULL DEFAULT 0,
    "total_amount_traded" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "avg_response_time_minutes" INTEGER,
    "last_order_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_wholesaler_connections_pkey" PRIMARY KEY ("connection_id")
);

-- CreateTable
CREATE TABLE "connection_block_requests" (
    "request_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "requested_by_user_type" "UserType" NOT NULL,
    "request_type" "BlockRequestType" NOT NULL,
    "request_reason" TEXT,
    "request_status" "BlockRequestStatus" NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_block_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "category_id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "parent_category_id" TEXT,
    "category_name_translations" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_name_translations" JSONB,
    "category_id" TEXT,
    "brand_name" TEXT,
    "manufacturer_barcode" TEXT,
    "system_generated_barcode" TEXT,
    "has_warranty" BOOLEAN NOT NULL DEFAULT false,
    "warranty_duration_months" INTEGER,
    "description" TEXT,
    "description_translations" JSONB,
    "product_images" JSONB,
    "unit_of_measure" TEXT NOT NULL DEFAULT 'piece',
    "created_by_user_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "wholesaler_products" (
    "wholesaler_product_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "base_price" DECIMAL(10,2) NOT NULL,
    "minimum_order_quantity" INTEGER NOT NULL DEFAULT 1,
    "stock_quantity" INTEGER,
    "low_stock_threshold" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wholesaler_products_pkey" PRIMARY KEY ("wholesaler_product_id")
);

-- CreateTable
CREATE TABLE "retailer_inventory" (
    "inventory_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "cost_price" DECIMAL(10,2),
    "selling_price" DECIMAL(10,2),
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 10,
    "reorder_quantity" INTEGER,
    "last_restocked_at" TIMESTAMP(3),
    "last_sold_at" TIMESTAMP(3),
    "sales_last_7_days" INTEGER NOT NULL DEFAULT 0,
    "sales_last_30_days" INTEGER NOT NULL DEFAULT 0,
    "avg_daily_sales" DECIMAL(8,2),
    "predicted_stockout_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retailer_inventory_pkey" PRIMARY KEY ("inventory_id")
);

-- CreateTable
CREATE TABLE "retailer_sales" (
    "sale_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "bill_number" TEXT NOT NULL,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "customer_email" TEXT,
    "customer_address" TEXT,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "net_amount" DECIMAL(10,2) NOT NULL,
    "payment_method" TEXT,
    "has_warranty_items" BOOLEAN NOT NULL DEFAULT false,
    "sale_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retailer_sales_pkey" PRIMARY KEY ("sale_id")
);

-- CreateTable
CREATE TABLE "retailer_sale_items" (
    "sale_item_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "has_warranty" BOOLEAN NOT NULL DEFAULT false,
    "warranty_valid_until" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retailer_sale_items_pkey" PRIMARY KEY ("sale_item_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "order_status" "OrderStatus" NOT NULL DEFAULT 'negotiating',
    "subtotal" DECIMAL(12,2),
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "final_price" DECIMAL(12,2),
    "final_price_entered_at" TIMESTAMP(3),
    "final_price_accepted_at" TIMESTAMP(3),
    "delivery_method" "DeliveryMethod",
    "calculated_distance_km" DECIMAL(8,2),
    "delivery_method_overridden" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_requested_by" TEXT,
    "cancellation_reason" TEXT,
    "cancellation_status" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "order_item_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "wholesaler_product_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "quoted_unit_price" DECIMAL(10,2),
    "final_unit_price" DECIMAL(10,2),
    "line_total" DECIMAL(12,2),
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price_locked_at" TIMESTAMP(3),

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_item_id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "message_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "order_id" TEXT,
    "sender_user_id" TEXT NOT NULL,
    "sender_user_type" "SenderUserType" NOT NULL,
    "sub_user_id" TEXT,
    "message_type" "MessageType" NOT NULL DEFAULT 'text',
    "message_text" TEXT,
    "file_attachments" JSONB,
    "is_broadcast" BOOLEAN NOT NULL DEFAULT false,
    "broadcast_id" TEXT,
    "is_delivered" BOOLEAN NOT NULL DEFAULT false,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "order_price_history" (
    "history_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT,
    "changed_by_user_id" TEXT NOT NULL,
    "change_type" TEXT NOT NULL,
    "previous_price" DECIMAL(10,2),
    "new_price" DECIMAL(10,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_price_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "broadcast_messages" (
    "broadcast_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "sent_by_sub_user_id" TEXT,
    "product_id" TEXT,
    "message_template" TEXT,
    "custom_message" TEXT,
    "final_message" TEXT NOT NULL,
    "product_price" DECIMAL(10,2),
    "product_images" JSONB,
    "target_type" TEXT,
    "target_retailer_ids" JSONB,
    "total_sent" INTEGER NOT NULL DEFAULT 0,
    "total_delivered" INTEGER NOT NULL DEFAULT 0,
    "total_replies" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_messages_pkey" PRIMARY KEY ("broadcast_id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "delivery_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "delivery_type" "DeliveryMethod" NOT NULL,
    "driver_id" TEXT,
    "driver_phone" TEXT,
    "driver_name" TEXT,
    "threePL_provider" TEXT,
    "threePL_tracking_id" TEXT,
    "threePL_tracking_url" TEXT,
    "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "assigned_at" TIMESTAMP(3),
    "pickup_scheduled_at" TIMESTAMP(3),
    "picked_up_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "delivery_otp" TEXT,
    "delivery_otp_verified_at" TIMESTAMP(3),
    "delivery_proof_image_url" TEXT,
    "tracking_started_at" TIMESTAMP(3),
    "tracking_ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("delivery_id")
);

-- CreateTable
CREATE TABLE "driver_locations" (
    "location_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "accuracy" DECIMAL(6,2),
    "speed" DECIMAL(5,2),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("location_id")
);

-- CreateTable
CREATE TABLE "delivery_milestones" (
    "milestone_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "milestone_type" TEXT NOT NULL,
    "milestone_description" TEXT,
    "location_name" TEXT,
    "updated_by_source" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_milestones_pkey" PRIMARY KEY ("milestone_id")
);

-- CreateTable
CREATE TABLE "cash_handover_confirmations" (
    "confirmation_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "delivery_otp" TEXT,
    "delivery_otp_verified" BOOLEAN NOT NULL DEFAULT false,
    "delivery_otp_verified_at" TIMESTAMP(3),
    "cash_amount" DECIMAL(12,2),
    "cash_collection_code" TEXT,
    "cash_confirmed_by_retailer" BOOLEAN NOT NULL DEFAULT false,
    "cash_confirmed_at" TIMESTAMP(3),
    "driver_settled_with_wholesaler" BOOLEAN NOT NULL DEFAULT false,
    "driver_settlement_notes" TEXT,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_handover_confirmations_pkey" PRIMARY KEY ("confirmation_id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "ledger_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "total_credit" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "total_debit" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "current_balance" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "last_transaction_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("ledger_id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "transaction_id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "transaction_type" "LedgerTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "is_credit" BOOLEAN NOT NULL,
    "order_id" TEXT,
    "payment_id" TEXT,
    "damage_claim_id" TEXT,
    "balance_before" DECIMAL(15,2),
    "balance_after" DECIMAL(15,2),
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "payment_id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "payment_method" "PaymentMethod",
    "amount" DECIMAL(12,2) NOT NULL,
    "collected_by_type" "CollectorType",
    "collected_by_driver_id" TEXT,
    "collected_by_sub_user_id" TEXT,
    "payment_reference_number" TEXT,
    "payment_proof_image_url" TEXT,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "verified_by_wholesaler_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "payment_otp" TEXT,
    "otp_verified" BOOLEAN NOT NULL DEFAULT false,
    "otp_verified_at" TIMESTAMP(3),
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "damage_claims" (
    "claim_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "delivery_id" TEXT,
    "retailer_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "claim_status" "ClaimStatus" NOT NULL DEFAULT 'pending',
    "total_claim_amount" DECIMAL(10,2) NOT NULL,
    "reviewed_by_wholesaler_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "return_urgency" "ReturnUrgency",
    "physical_return_status" "PhysicalReturnStatus",
    "return_scheduled_date" DATE,
    "return_received_at" TIMESTAMP(3),
    "refund_credited_to_ledger" BOOLEAN NOT NULL DEFAULT false,
    "ledger_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "damage_claims_pkey" PRIMARY KEY ("claim_id")
);

-- CreateTable
CREATE TABLE "damage_claim_items" (
    "claim_item_id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "damaged_quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_refund_amount" DECIMAL(10,2) NOT NULL,
    "damage_description" TEXT,
    "damage_proof_images" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "damage_claim_items_pkey" PRIMARY KEY ("claim_item_id")
);

-- CreateTable
CREATE TABLE "warranty_claims" (
    "warranty_claim_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "sale_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "issue_description" TEXT NOT NULL,
    "issue_images" JSONB,
    "warranty_valid_until" DATE NOT NULL,
    "claim_status" "WarrantyClaimStatus" NOT NULL DEFAULT 'reported',
    "replacement_given_at" TIMESTAMP(3),
    "replacement_product_id" TEXT,
    "sent_to_wholesaler_at" TIMESTAMP(3),
    "received_by_wholesaler_at" TIMESTAMP(3),
    "sent_to_manufacturer_at" TIMESTAMP(3),
    "resolution_type" TEXT,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("warranty_claim_id")
);

-- CreateTable
CREATE TABLE "stock_alerts" (
    "alert_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "inventory_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "alert_type" TEXT,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_stock" INTEGER NOT NULL,
    "low_stock_threshold" INTEGER NOT NULL,
    "predicted_stockout_days" INTEGER,
    "recommended_quantity" INTEGER,
    "recommended_wholesaler_id" TEXT,
    "recommendation_reasons" JSONB,
    "action_taken" TEXT,
    "action_taken_at" TIMESTAMP(3),
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("alert_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sent_via_app" BOOLEAN NOT NULL DEFAULT true,
    "sent_via_email" BOOLEAN NOT NULL DEFAULT false,
    "sent_via_sms" BOOLEAN NOT NULL DEFAULT false,
    "action_url" TEXT,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "preference_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "preferences" JSONB NOT NULL DEFAULT '{"stock_alert":{"app":true,"email":true,"sms":false},"order_update":{"app":true,"email":true,"sms":true},"payment_request":{"app":true,"email":true,"sms":false},"damage_claim":{"app":true,"email":true,"sms":false},"chat_message":{"app":true,"email":false,"sms":false},"connection_request":{"app":true,"email":true,"sms":true},"broadcast_message":{"app":true,"email":false,"sms":false}}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("preference_id")
);

-- CreateTable
CREATE TABLE "broadcast_message_templates" (
    "template_id" TEXT NOT NULL,
    "category_id" TEXT,
    "template_name" TEXT NOT NULL,
    "template_type" TEXT,
    "message_templates" JSONB NOT NULL,
    "available_variables" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_message_templates_pkey" PRIMARY KEY ("template_id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sub_user_id" TEXT,
    "session_token" TEXT NOT NULL,
    "device_type" "DeviceType",
    "device_name" TEXT,
    "device_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "fcm_token" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "setting_id" TEXT NOT NULL,
    "setting_key" TEXT NOT NULL,
    "setting_value" TEXT NOT NULL,
    "value_type" TEXT,
    "description" TEXT,
    "is_editable" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("setting_id")
);

-- CreateTable
CREATE TABLE "app_versions" (
    "version_id" TEXT NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "version_number" TEXT NOT NULL,
    "version_code" INTEGER NOT NULL,
    "is_latest" BOOLEAN NOT NULL DEFAULT false,
    "is_force_update" BOOLEAN NOT NULL DEFAULT false,
    "minimum_supported_version" TEXT,
    "release_notes" TEXT,
    "release_notes_translations" JSONB,
    "download_url" TEXT,
    "released_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_versions_pkey" PRIMARY KEY ("version_id")
);

-- CreateTable
CREATE TABLE "feature_packages" (
    "package_id" TEXT NOT NULL,
    "package_name" TEXT NOT NULL,
    "package_code" TEXT NOT NULL,
    "display_name" JSONB,
    "description" JSONB,
    "price_monthly" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "features" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_packages_pkey" PRIMARY KEY ("package_id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "subscription_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "is_trial" BOOLEAN NOT NULL DEFAULT true,
    "trial_days_remaining" INTEGER NOT NULL DEFAULT 30,
    "custom_features" JSONB,
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "last_payment_date" TIMESTAMP(3),
    "next_billing_date" DATE,
    "current_month_stats" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateTable
CREATE TABLE "feature_usage_logs" (
    "log_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "feature_code" TEXT NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 1,
    "first_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "success_rate" DECIMAL(5,2),
    "created_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_usage_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "onboarding_responses" (
    "response_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_type" TEXT,
    "store_size" TEXT,
    "daily_transactions_range" TEXT,
    "pain_points" JSONB,
    "primary_goal" TEXT,
    "tech_comfort_level" TEXT,
    "has_used_similar_app" BOOLEAN NOT NULL DEFAULT false,
    "wants_ai" BOOLEAN NOT NULL DEFAULT false,
    "wants_supplier_connections" BOOLEAN NOT NULL DEFAULT false,
    "wants_pos" BOOLEAN NOT NULL DEFAULT true,
    "wants_analytics" BOOLEAN NOT NULL DEFAULT false,
    "recommended_package_code" TEXT,
    "actually_selected_package_code" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_responses_pkey" PRIMARY KEY ("response_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_number_idx" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_user_type_idx" ON "users"("user_type");

-- CreateIndex
CREATE INDEX "otps_phone_number_idx" ON "otps"("phone_number");

-- CreateIndex
CREATE INDEX "otps_user_id_idx" ON "otps"("user_id");

-- CreateIndex
CREATE INDEX "otps_otp_type_reference_id_idx" ON "otps"("otp_type", "reference_id");

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- CreateIndex
CREATE INDEX "addresses_latitude_longitude_idx" ON "addresses"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "wholesaler_profiles_user_id_key" ON "wholesaler_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wholesaler_profiles_gst_number_key" ON "wholesaler_profiles"("gst_number");

-- CreateIndex
CREATE INDEX "wholesaler_profiles_user_id_idx" ON "wholesaler_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_profiles_user_id_key" ON "retailer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_profiles_gst_number_key" ON "retailer_profiles"("gst_number");

-- CreateIndex
CREATE INDEX "retailer_profiles_user_id_idx" ON "retailer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wholesaler_sub_users_phone_number_key" ON "wholesaler_sub_users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "wholesaler_sub_users_email_key" ON "wholesaler_sub_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "wholesaler_sub_users_secret_code_key" ON "wholesaler_sub_users"("secret_code");

-- CreateIndex
CREATE INDEX "wholesaler_sub_users_wholesaler_id_idx" ON "wholesaler_sub_users"("wholesaler_id");

-- CreateIndex
CREATE INDEX "wholesaler_sub_users_phone_number_idx" ON "wholesaler_sub_users"("phone_number");

-- CreateIndex
CREATE INDEX "wholesaler_sub_users_secret_code_idx" ON "wholesaler_sub_users"("secret_code");

-- CreateIndex
CREATE INDEX "sub_user_permissions_sub_user_id_idx" ON "sub_user_permissions"("sub_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_user_permissions_sub_user_id_permission_key_key" ON "sub_user_permissions"("sub_user_id", "permission_key");

-- CreateIndex
CREATE INDEX "retailer_wholesaler_connections_retailer_id_idx" ON "retailer_wholesaler_connections"("retailer_id");

-- CreateIndex
CREATE INDEX "retailer_wholesaler_connections_wholesaler_id_idx" ON "retailer_wholesaler_connections"("wholesaler_id");

-- CreateIndex
CREATE INDEX "retailer_wholesaler_connections_connection_status_idx" ON "retailer_wholesaler_connections"("connection_status");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_wholesaler_connections_retailer_id_wholesaler_id_key" ON "retailer_wholesaler_connections"("retailer_id", "wholesaler_id");

-- CreateIndex
CREATE INDEX "connection_block_requests_connection_id_idx" ON "connection_block_requests"("connection_id");

-- CreateIndex
CREATE INDEX "connection_block_requests_request_status_idx" ON "connection_block_requests"("request_status");

-- CreateIndex
CREATE INDEX "product_categories_parent_category_id_idx" ON "product_categories"("parent_category_id");

-- CreateIndex
CREATE INDEX "product_categories_category_name_idx" ON "product_categories"("category_name");

-- CreateIndex
CREATE UNIQUE INDEX "products_manufacturer_barcode_key" ON "products"("manufacturer_barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_system_generated_barcode_key" ON "products"("system_generated_barcode");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_manufacturer_barcode_idx" ON "products"("manufacturer_barcode");

-- CreateIndex
CREATE INDEX "products_system_generated_barcode_idx" ON "products"("system_generated_barcode");

-- CreateIndex
CREATE INDEX "products_product_name_idx" ON "products"("product_name");

-- CreateIndex
CREATE INDEX "wholesaler_products_wholesaler_id_idx" ON "wholesaler_products"("wholesaler_id");

-- CreateIndex
CREATE INDEX "wholesaler_products_product_id_idx" ON "wholesaler_products"("product_id");

-- CreateIndex
CREATE INDEX "wholesaler_products_is_active_idx" ON "wholesaler_products"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "wholesaler_products_wholesaler_id_product_id_key" ON "wholesaler_products"("wholesaler_id", "product_id");

-- CreateIndex
CREATE INDEX "retailer_inventory_retailer_id_idx" ON "retailer_inventory"("retailer_id");

-- CreateIndex
CREATE INDEX "retailer_inventory_product_id_idx" ON "retailer_inventory"("product_id");

-- CreateIndex
CREATE INDEX "retailer_inventory_current_stock_low_stock_threshold_idx" ON "retailer_inventory"("current_stock", "low_stock_threshold");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_inventory_retailer_id_product_id_key" ON "retailer_inventory"("retailer_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_sales_bill_number_key" ON "retailer_sales"("bill_number");

-- CreateIndex
CREATE INDEX "retailer_sales_retailer_id_idx" ON "retailer_sales"("retailer_id");

-- CreateIndex
CREATE INDEX "retailer_sales_bill_number_idx" ON "retailer_sales"("bill_number");

-- CreateIndex
CREATE INDEX "retailer_sales_customer_phone_idx" ON "retailer_sales"("customer_phone");

-- CreateIndex
CREATE INDEX "retailer_sales_sale_date_idx" ON "retailer_sales"("sale_date");

-- CreateIndex
CREATE INDEX "retailer_sale_items_sale_id_idx" ON "retailer_sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "retailer_sale_items_product_id_idx" ON "retailer_sale_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_retailer_id_idx" ON "orders"("retailer_id");

-- CreateIndex
CREATE INDEX "orders_wholesaler_id_idx" ON "orders"("wholesaler_id");

-- CreateIndex
CREATE INDEX "orders_order_status_idx" ON "orders"("order_status");

-- CreateIndex
CREATE INDEX "orders_order_number_idx" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_connection_id_idx" ON "orders"("connection_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "chat_messages_connection_id_idx" ON "chat_messages"("connection_id");

-- CreateIndex
CREATE INDEX "chat_messages_order_id_idx" ON "chat_messages"("order_id");

-- CreateIndex
CREATE INDEX "chat_messages_sender_user_id_idx" ON "chat_messages"("sender_user_id");

-- CreateIndex
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages"("created_at");

-- CreateIndex
CREATE INDEX "order_price_history_order_id_idx" ON "order_price_history"("order_id");

-- CreateIndex
CREATE INDEX "broadcast_messages_wholesaler_id_idx" ON "broadcast_messages"("wholesaler_id");

-- CreateIndex
CREATE INDEX "broadcast_messages_created_at_idx" ON "broadcast_messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_order_id_key" ON "deliveries"("order_id");

-- CreateIndex
CREATE INDEX "deliveries_order_id_idx" ON "deliveries"("order_id");

-- CreateIndex
CREATE INDEX "deliveries_driver_id_idx" ON "deliveries"("driver_id");

-- CreateIndex
CREATE INDEX "deliveries_delivery_status_idx" ON "deliveries"("delivery_status");

-- CreateIndex
CREATE INDEX "driver_locations_delivery_id_idx" ON "driver_locations"("delivery_id");

-- CreateIndex
CREATE INDEX "driver_locations_recorded_at_idx" ON "driver_locations"("recorded_at");

-- CreateIndex
CREATE INDEX "delivery_milestones_delivery_id_idx" ON "delivery_milestones"("delivery_id");

-- CreateIndex
CREATE INDEX "cash_handover_confirmations_delivery_id_idx" ON "cash_handover_confirmations"("delivery_id");

-- CreateIndex
CREATE INDEX "ledger_accounts_retailer_id_idx" ON "ledger_accounts"("retailer_id");

-- CreateIndex
CREATE INDEX "ledger_accounts_wholesaler_id_idx" ON "ledger_accounts"("wholesaler_id");

-- CreateIndex
CREATE INDEX "ledger_accounts_current_balance_idx" ON "ledger_accounts"("current_balance");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_retailer_id_wholesaler_id_key" ON "ledger_accounts"("retailer_id", "wholesaler_id");

-- CreateIndex
CREATE INDEX "ledger_transactions_ledger_id_idx" ON "ledger_transactions"("ledger_id");

-- CreateIndex
CREATE INDEX "ledger_transactions_transaction_type_idx" ON "ledger_transactions"("transaction_type");

-- CreateIndex
CREATE INDEX "ledger_transactions_created_at_idx" ON "ledger_transactions"("created_at");

-- CreateIndex
CREATE INDEX "payment_records_ledger_id_idx" ON "payment_records"("ledger_id");

-- CreateIndex
CREATE INDEX "payment_records_retailer_id_idx" ON "payment_records"("retailer_id");

-- CreateIndex
CREATE INDEX "payment_records_wholesaler_id_idx" ON "payment_records"("wholesaler_id");

-- CreateIndex
CREATE INDEX "payment_records_payment_status_idx" ON "payment_records"("payment_status");

-- CreateIndex
CREATE INDEX "damage_claims_order_id_idx" ON "damage_claims"("order_id");

-- CreateIndex
CREATE INDEX "damage_claims_retailer_id_idx" ON "damage_claims"("retailer_id");

-- CreateIndex
CREATE INDEX "damage_claims_wholesaler_id_idx" ON "damage_claims"("wholesaler_id");

-- CreateIndex
CREATE INDEX "damage_claims_claim_status_idx" ON "damage_claims"("claim_status");

-- CreateIndex
CREATE INDEX "damage_claim_items_claim_id_idx" ON "damage_claim_items"("claim_id");

-- CreateIndex
CREATE INDEX "warranty_claims_retailer_id_idx" ON "warranty_claims"("retailer_id");

-- CreateIndex
CREATE INDEX "warranty_claims_wholesaler_id_idx" ON "warranty_claims"("wholesaler_id");

-- CreateIndex
CREATE INDEX "warranty_claims_claim_status_idx" ON "warranty_claims"("claim_status");

-- CreateIndex
CREATE INDEX "stock_alerts_retailer_id_idx" ON "stock_alerts"("retailer_id");

-- CreateIndex
CREATE INDEX "stock_alerts_inventory_id_idx" ON "stock_alerts"("inventory_id");

-- CreateIndex
CREATE INDEX "stock_alerts_created_at_idx" ON "stock_alerts"("created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_notification_type_idx" ON "notifications"("notification_type");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "broadcast_message_templates_category_id_idx" ON "broadcast_message_templates"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_session_token_key" ON "user_sessions"("session_token");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_session_token_idx" ON "user_sessions"("session_token");

-- CreateIndex
CREATE INDEX "user_sessions_is_active_expires_at_idx" ON "user_sessions"("is_active", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_setting_key_key" ON "system_settings"("setting_key");

-- CreateIndex
CREATE INDEX "system_settings_setting_key_idx" ON "system_settings"("setting_key");

-- CreateIndex
CREATE INDEX "app_versions_platform_idx" ON "app_versions"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "app_versions_platform_version_number_key" ON "app_versions"("platform", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "feature_packages_package_name_key" ON "feature_packages"("package_name");

-- CreateIndex
CREATE UNIQUE INDEX "feature_packages_package_code_key" ON "feature_packages"("package_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscriptions_user_id_key" ON "user_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "user_subscriptions_user_id_idx" ON "user_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "user_subscriptions_status_idx" ON "user_subscriptions"("status");

-- CreateIndex
CREATE INDEX "feature_usage_logs_user_id_idx" ON "feature_usage_logs"("user_id");

-- CreateIndex
CREATE INDEX "feature_usage_logs_feature_code_idx" ON "feature_usage_logs"("feature_code");

-- CreateIndex
CREATE UNIQUE INDEX "feature_usage_logs_user_id_feature_code_created_date_key" ON "feature_usage_logs"("user_id", "feature_code", "created_date");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_responses_user_id_key" ON "onboarding_responses"("user_id");

-- AddForeignKey
ALTER TABLE "otps" ADD CONSTRAINT "otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesaler_profiles" ADD CONSTRAINT "wholesaler_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_profiles" ADD CONSTRAINT "retailer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesaler_sub_users" ADD CONSTRAINT "wholesaler_sub_users_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_user_permissions" ADD CONSTRAINT "sub_user_permissions_sub_user_id_fkey" FOREIGN KEY ("sub_user_id") REFERENCES "wholesaler_sub_users"("sub_user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_wholesaler_connections" ADD CONSTRAINT "retailer_wholesaler_connections_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_wholesaler_connections" ADD CONSTRAINT "retailer_wholesaler_connections_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_wholesaler_connections" ADD CONSTRAINT "retailer_wholesaler_connections_connected_by_sub_user_id_fkey" FOREIGN KEY ("connected_by_sub_user_id") REFERENCES "wholesaler_sub_users"("sub_user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_block_requests" ADD CONSTRAINT "connection_block_requests_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "retailer_wholesaler_connections"("connection_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "product_categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesaler_products" ADD CONSTRAINT "wholesaler_products_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesaler_products" ADD CONSTRAINT "wholesaler_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_inventory" ADD CONSTRAINT "retailer_inventory_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_inventory" ADD CONSTRAINT "retailer_inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_sales" ADD CONSTRAINT "retailer_sales_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_sale_items" ADD CONSTRAINT "retailer_sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "retailer_sales"("sale_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_sale_items" ADD CONSTRAINT "retailer_sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "retailer_wholesaler_connections"("connection_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_wholesaler_product_id_fkey" FOREIGN KEY ("wholesaler_product_id") REFERENCES "wholesaler_products"("wholesaler_product_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "retailer_wholesaler_connections"("connection_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sub_user_id_fkey" FOREIGN KEY ("sub_user_id") REFERENCES "wholesaler_sub_users"("sub_user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_price_history" ADD CONSTRAINT "order_price_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_price_history" ADD CONSTRAINT "order_price_history_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("order_item_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_messages" ADD CONSTRAINT "broadcast_messages_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_messages" ADD CONSTRAINT "broadcast_messages_sent_by_sub_user_id_fkey" FOREIGN KEY ("sent_by_sub_user_id") REFERENCES "wholesaler_sub_users"("sub_user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_messages" ADD CONSTRAINT "broadcast_messages_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("delivery_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_milestones" ADD CONSTRAINT "delivery_milestones_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("delivery_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_handover_confirmations" ADD CONSTRAINT "cash_handover_confirmations_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("delivery_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "retailer_wholesaler_connections"("connection_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledger_accounts"("ledger_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledger_accounts"("ledger_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_collected_by_sub_user_id_fkey" FOREIGN KEY ("collected_by_sub_user_id") REFERENCES "wholesaler_sub_users"("sub_user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_claims" ADD CONSTRAINT "damage_claims_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_claims" ADD CONSTRAINT "damage_claims_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("delivery_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_claims" ADD CONSTRAINT "damage_claims_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_claims" ADD CONSTRAINT "damage_claims_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_claims" ADD CONSTRAINT "damage_claims_ledger_transaction_id_fkey" FOREIGN KEY ("ledger_transaction_id") REFERENCES "ledger_transactions"("transaction_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_claim_items" ADD CONSTRAINT "damage_claim_items_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "damage_claims"("claim_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_claim_items" ADD CONSTRAINT "damage_claim_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("order_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_claim_items" ADD CONSTRAINT "damage_claim_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "retailer_sales"("sale_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "retailer_sale_items"("sale_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "retailer_inventory"("inventory_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_message_templates" ADD CONSTRAINT "broadcast_message_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "feature_packages"("package_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_usage_logs" ADD CONSTRAINT "feature_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_responses" ADD CONSTRAINT "onboarding_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_responses" ADD CONSTRAINT "onboarding_responses_recommended_package_code_fkey" FOREIGN KEY ("recommended_package_code") REFERENCES "feature_packages"("package_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_responses" ADD CONSTRAINT "onboarding_responses_actually_selected_package_code_fkey" FOREIGN KEY ("actually_selected_package_code") REFERENCES "feature_packages"("package_code") ON DELETE SET NULL ON UPDATE CASCADE;
