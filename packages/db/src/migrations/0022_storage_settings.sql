CREATE TYPE "public"."storage_backend" AS ENUM('local', 'r2');--> statement-breakpoint
CREATE TABLE "storage_settings" (
	"backend" "storage_backend" DEFAULT 'local' NOT NULL,
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"public_base_url" text,
	"r2_access_key_id" text,
	"r2_bucket" text,
	"r2_endpoint" text,
	"r2_secret_access_key_cipher" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "storage_settings_single_row" CHECK ("storage_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "storage_settings" ADD CONSTRAINT "storage_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;