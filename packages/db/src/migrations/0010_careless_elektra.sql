ALTER TABLE "ai_provider_config" DROP CONSTRAINT "ai_provider_config_singleton";--> statement-breakpoint
ALTER TABLE "ai_provider_config" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ai_provider_config" ALTER COLUMN "id" SET DATA TYPE uuid USING gen_random_uuid();--> statement-breakpoint
ALTER TABLE "ai_provider_config" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
