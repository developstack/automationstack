CREATE TABLE "ai_provider_config" (
	"api_key_ciphertext" text,
	"base_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"model_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ai_provider_config_singleton" CHECK ("ai_provider_config"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "ai_provider_config" ADD CONSTRAINT "ai_provider_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;