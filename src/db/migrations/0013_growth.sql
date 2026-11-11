ALTER TYPE "public"."order_status" ADD VALUE 'awaiting_choice' BEFORE 'video_rendering';--> statement-breakpoint
CREATE TABLE "affiliate_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"discount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_attributions_orderId_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "affiliate_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "affiliate_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"code_id" uuid NOT NULL,
	"base_net_cents" integer NOT NULL,
	"commission_pct" integer NOT NULL,
	"commission_cents" integer NOT NULL,
	"is_test" boolean NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payable_at" timestamp with time zone NOT NULL,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_commissions_orderId_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "affiliate_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"is_test" boolean NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issuer" jsonb NOT NULL,
	"recipient" jsonb NOT NULL,
	"tax_status" text NOT NULL,
	"lines" jsonb NOT NULL,
	"net_cents" integer NOT NULL,
	"tax_cents" integer NOT NULL,
	"gross_cents" integer NOT NULL,
	"iban" text NOT NULL,
	"account_holder" text NOT NULL,
	"storage_key" text NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" text,
	"created_by" text,
	CONSTRAINT "affiliate_payouts_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"full_name" text NOT NULL,
	"company" text,
	"street" text NOT NULL,
	"postal_code" text NOT NULL,
	"city" text NOT NULL,
	"country" text DEFAULT 'Deutschland' NOT NULL,
	"channels" text NOT NULL,
	"account_holder" text NOT NULL,
	"iban" text NOT NULL,
	"tax_status" text NOT NULL,
	"vat_id" text,
	"tax_number" text,
	"discount_pct" integer,
	"commission_pct" integer,
	"admin_note" text,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliates_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text DEFAULT 'rendering' NOT NULL,
	"video_id" uuid,
	"target_folder" text,
	"remote_path" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"note" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_orderId_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "occasions" ADD COLUMN "publication_folder" text;--> statement-breakpoint
ALTER TABLE "occasions" ADD COLUMN "publication_discount_pct" integer;--> statement-breakpoint
ALTER TABLE "occasions" ADD COLUMN "video_template" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "publication" jsonb;--> statement-breakpoint
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_code_id_affiliate_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."affiliate_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_codes" ADD CONSTRAINT "affiliate_codes_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_code_id_affiliate_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."affiliate_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_payout_id_affiliate_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."affiliate_payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_codes_affiliate_id_index" ON "affiliate_codes" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX "affiliate_commissions_affiliate_id_status_index" ON "affiliate_commissions" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE INDEX "affiliate_payouts_affiliate_id_index" ON "affiliate_payouts" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX "affiliates_status_index" ON "affiliates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "publications_status_index" ON "publications" USING btree ("status");