CREATE TABLE "dev_mock_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"description" text NOT NULL,
	"redirect_url" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dev_mock_payments_idempotencyKey_unique" UNIQUE("idempotency_key")
);
