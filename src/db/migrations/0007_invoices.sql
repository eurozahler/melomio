CREATE TABLE "invoice_counters" (
	"series" text NOT NULL,
	"year" integer NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counters_series_year_pk" PRIMARY KEY("series","year")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" text,
	"cancels_invoice_id" uuid,
	"is_test" boolean NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"service_date" timestamp with time zone NOT NULL,
	"seller" jsonb NOT NULL,
	"buyer" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"net_cents" integer NOT NULL,
	"tax_cents" integer NOT NULL,
	"gross_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"payment_note" text,
	"reason" text,
	"storage_key" text NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cancels_invoice_id_invoices_id_fk" FOREIGN KEY ("cancels_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_order_id_index" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "invoices_issued_at_index" ON "invoices" USING btree ("issued_at");