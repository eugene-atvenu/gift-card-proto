-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."account_type" AS ENUM('company', 'gift_card', 'generic_in', 'generic_out');--> statement-breakpoint
CREATE TYPE "public"."user_company_role" AS ENUM('admin', 'owner', 'user');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" "account_type" NOT NULL,
	"company_id" integer NOT NULL,
	"gift_card_id" bigint,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"deleted_at" timestamp,
	"allowed_credit" numeric(18, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"email" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"deleted_at" timestamp,
	"profile" jsonb,
	CONSTRAINT "users_username_key" UNIQUE("username"),
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"company_id" integer,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"deleted_at" timestamp,
	CONSTRAINT "gift_cards_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ledger_id" bigint NOT NULL,
	"ledger_time" timestamp with time zone NOT NULL,
	"account_id" bigint NOT NULL,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_companies" (
	"user_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"role" "user_company_role" NOT NULL,
	CONSTRAINT "user_companies_pkey" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" bigserial NOT NULL,
	"company_id" integer NOT NULL,
	"description" text,
	"time" timestamp with time zone NOT NULL,
	CONSTRAINT "ledger_pkey" PRIMARY KEY("id","time")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_gift_card_id_fkey" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_id_time_fkey" FOREIGN KEY ("ledger_id","ledger_time") REFERENCES "_timescaledb_internal"."_hyper_5_4_chunk"("id","time") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_id_time_fkey1" FOREIGN KEY ("ledger_id","ledger_time") REFERENCES "_timescaledb_internal"."_hyper_5_5_chunk"("id","time") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_id_ledger_time_fkey" FOREIGN KEY ("ledger_id","ledger_time") REFERENCES "public"."ledger"("id","time") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_gift_card_active_idx" ON "accounts" USING btree ("gift_card_id" int8_ops) WHERE ((deleted_at IS NULL) AND (type = 'gift_card'::account_type));--> statement-breakpoint
CREATE INDEX "ledger_entries_account_id_idx" ON "ledger_entries" USING btree ("account_id" int8_ops);--> statement-breakpoint
CREATE INDEX "ledger_entries_ledger_id_idx" ON "ledger_entries" USING btree ("ledger_id" int8_ops);--> statement-breakpoint
CREATE INDEX "ledger_company_id_time_idx" ON "ledger" USING btree ("company_id" timestamptz_ops,"time" int4_ops);--> statement-breakpoint
CREATE INDEX "ledger_time_idx" ON "ledger" USING btree ("time" timestamptz_ops);
*/