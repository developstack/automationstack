CREATE TYPE "public"."auth_provider" AS ENUM('local', 'casdoor');--> statement-breakpoint
CREATE TABLE "auth_settings" (
	"admin_role" text,
	"client_id" text,
	"client_secret_cipher" text,
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"issuer" text,
	"last_test_ok_at" timestamp with time zone,
	"organization" text,
	"provider" "auth_provider" DEFAULT 'local' NOT NULL,
	"redirect_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"webhook_secret_cipher" text,
	CONSTRAINT "auth_settings_single_row" CHECK ("auth_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "settings_change_log" (
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settings_key" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_settings" ADD CONSTRAINT "auth_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings_change_log" ADD CONSTRAINT "settings_change_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;