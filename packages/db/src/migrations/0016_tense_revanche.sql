ALTER TABLE "farm_nodes" ADD COLUMN "capabilities" jsonb;--> statement-breakpoint
ALTER TABLE "farm_nodes" ADD COLUMN "capabilities_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farm_nodes" ADD COLUMN "refresh_requested_at" timestamp with time zone;